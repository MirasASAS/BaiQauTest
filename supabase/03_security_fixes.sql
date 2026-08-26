-- ═══════════════════════════════════════════════════════════════════
-- SECURITY & FIXES
-- Запустить весь файл в SQL Editor Supabase (повторный запуск безопасен).
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Запрет смены role/is_blocked не-админом (защита от self-promotion)
--    Раньше пользователь мог обновить свой профиль и стать админом.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_blocked IS DISTINCT FROM OLD.is_blocked)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Недостаточно прав для изменения роли';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ────────────────────────────────────────────────────────────────────
-- 2. Валидация результатов теста (защита от накрутки баллов)
--    score не может быть отрицательным, total_score должен совпадать
--    с числом вопросов варианта, score не может превышать total_score.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_result_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  q_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.score = NEW.score AND OLD.total_score = NEW.total_score AND OLD.variant_id = NEW.variant_id THEN
    RETURN NEW;
  END IF;
  IF NEW.score < 0 THEN
    RAISE EXCEPTION 'score cannot be negative';
  END IF;
  SELECT COUNT(*) INTO q_count FROM public.questions WHERE variant_id = NEW.variant_id;
  IF NEW.total_score <> q_count THEN
    RAISE EXCEPTION 'total_score не соответствует количеству вопросов варианта';
  END IF;
  IF NEW.score > NEW.total_score THEN
    RAISE EXCEPTION 'score не может превышать total_score';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_result_score_trigger ON public.results;
CREATE TRIGGER validate_result_score_trigger
  BEFORE INSERT OR UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.validate_result_score();

-- ────────────────────────────────────────────────────────────────────
-- 3. Транзакционная публикация вопросов импорта (атомарно)
--    Всё в одной транзакции: вставка в questions + total_score +
--    статусы import_questions + статус job. Частичной публикации нет.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_import_questions(
  p_import_id BIGINT,
  p_variant_id BIGINT,
  p_question_ids BIGINT[]
)
RETURNS TABLE (published INTEGER, failed INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  q RECORD;
  v_order INTEGER;
  pub INTEGER := 0;
  fail INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.variants WHERE id = p_variant_id) THEN
    RAISE EXCEPTION 'Вариант не найден';
  END IF;

  FOR q IN
    SELECT * FROM public.import_questions
    WHERE import_id = p_import_id
      AND id = ANY(p_question_ids)
      AND status <> 'review'
      AND needs_review = FALSE
  LOOP
    BEGIN
      SELECT COALESCE(MAX(order_num), 0) + 1 INTO v_order FROM public.questions WHERE variant_id = p_variant_id;
      INSERT INTO public.questions (
        variant_id, question_text,
        option_a, option_b, option_c, option_d,
        correct_answer, score, order_num
      ) VALUES (
        p_variant_id,
        COALESCE(NULLIF(q.question_ru, ''), NULLIF(q.question_kz, ''), ''),
        COALESCE(NULLIF(q.option_a_ru, ''), NULLIF(q.option_a_kz, ''), ''),
        COALESCE(NULLIF(q.option_b_ru, ''), NULLIF(q.option_b_kz, ''), ''),
        COALESCE(NULLIF(q.option_c_ru, ''), NULLIF(q.option_c_kz, ''), ''),
        COALESCE(NULLIF(q.option_d_ru, ''), NULLIF(q.option_d_kz, ''), ''),
        q.correct_answer,
        1,
        v_order
      );
      UPDATE public.import_questions
      SET status = 'published', updated_at = NOW()
      WHERE id = q.id;
      v_order := v_order + 1;
      pub := pub + 1;
    EXCEPTION WHEN OTHERS THEN
      fail := fail + 1;
    END;
  END LOOP;

  UPDATE public.variants v
  SET total_score = (SELECT COUNT(*) FROM public.questions q2 WHERE q2.variant_id = v.id)
  WHERE v.id = p_variant_id;

  IF pub > 0 AND fail = 0 THEN
    UPDATE public.import_jobs
    SET status = 'published', completed_at = NOW()
    WHERE id = p_import_id;
  ELSIF pub > 0 AND fail > 0 THEN
    UPDATE public.import_jobs
    SET status = 'review', error = fail || ' вопросов не опубликовано'
    WHERE id = p_import_id;
  ELSE
    UPDATE public.import_jobs
    SET status = 'review', error = 'Публикация не удалась'
    WHERE id = p_import_id;
  END IF;

  RETURN QUERY SELECT pub, fail;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_import_questions(BIGINT, BIGINT, BIGINT[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_import_questions(BIGINT, BIGINT, BIGINT[]) FROM anon;

-- ────────────────────────────────────────────────────────────────────
-- 4. Геймификация: дедупликация попыток (последняя попытка на вариант)
--    и user_id в лидерборде для надёжного определения «вы».
-- ────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_leaderboard();
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  user_id uuid,
  nickname text,
  tests_count bigint,
  avg_percent numeric,
  best_percent numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.student_id, r.variant_id) r.*
    FROM public.results r
    ORDER BY r.student_id, r.variant_id, r.taken_at DESC
  )
  SELECT p.id::uuid AS user_id,
         COALESCE(NULLIF(p.nickname, ''),
                  TRIM(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
                  'Аноним') AS nickname,
         COUNT(l.id)::bigint AS tests_count,
         ROUND(AVG(l.score::numeric / NULLIF(l.total_score, 0)) * 100) AS avg_percent,
         MAX(ROUND(l.score::numeric / NULLIF(l.total_score, 0) * 100)) AS best_percent
  FROM latest l
  JOIN public.profiles p ON p.id = l.student_id
  WHERE l.total_score > 0
  GROUP BY p.id, p.nickname, p.last_name, p.first_name
  ORDER BY avg_percent DESC
  LIMIT 10;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_rank();
CREATE OR REPLACE FUNCTION public.get_my_rank()
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  nickname text,
  avg_percent numeric,
  tests_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.student_id, r.variant_id) r.*
    FROM public.results r
    ORDER BY r.student_id, r.variant_id, r.taken_at DESC
  ),
  ranked AS (
    SELECT p.id AS user_id,
           COALESCE(NULLIF(p.nickname, ''),
                    TRIM(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
                    'Аноним') AS nickname,
           COUNT(l.id)::bigint AS tests_count,
           ROUND(AVG(l.score::numeric / NULLIF(l.total_score, 0)) * 100) AS avg_percent,
           ROW_NUMBER() OVER (ORDER BY AVG(l.score::numeric / NULLIF(l.total_score, 0)) DESC)::bigint AS rank
    FROM latest l
    JOIN public.profiles p ON p.id = l.student_id
    WHERE l.total_score > 0
    GROUP BY p.id, p.nickname, p.last_name, p.first_name
  )
  SELECT ranked.rank, ranked.user_id, ranked.nickname, ranked.avg_percent, ranked.tests_count
  FROM ranked WHERE ranked.user_id = uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_badges()
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  badges text[] := '{}'::text[];
  n_tests bigint;
  has_90 boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT COUNT(DISTINCT variant_id) INTO n_tests FROM public.results WHERE student_id = uid;

  SELECT EXISTS (
    SELECT 1 FROM public.results
    WHERE student_id = uid AND total_score > 0 AND (score::numeric / total_score) >= 0.9
  ) INTO has_90;

  IF n_tests >= 1   THEN badges := array_append(badges, 'first_test');       END IF;
  IF n_tests >= 10  THEN badges := array_append(badges, 'ten_tests');        END IF;
  IF n_tests >= 25  THEN badges := array_append(badges, 'twenty_five_tests'); END IF;
  IF has_90         THEN badges := array_append(badges, 'high_score');       END IF;

  RETURN badges;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rank() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_rank() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_badges() FROM anon;
