-- ═══════════════════════════════════════════════════════════════════
-- BILINGUAL CONTENT + TOPICS + IMAGES
--   • вопрос хранит оба языка: question_text / option_* — русский (основной),
--     question_text_kz / option_*_kz — казахский (может быть пустым)
--   • тема, сложность (1–3) и картинка вопроса
--   • импорт при публикации больше не теряет казахский перевод и тему
--   • статистика ученика по темам (get_my_topic_stats)
--   • bucket question-images для картинок вопросов
-- Запускать после 09_attempts_and_fair_ranking.sql.
-- Если позже повторно запускаете 09 — после него снова запустите этот файл:
-- он переопределяет start_test_attempt / get_result_review / get_question_for_explain.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Новые колонки
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_text_kz TEXT,
  ADD COLUMN IF NOT EXISTS option_a_kz TEXT,
  ADD COLUMN IF NOT EXISTS option_b_kz TEXT,
  ADD COLUMN IF NOT EXISTS option_c_kz TEXT,
  ADD COLUMN IF NOT EXISTS option_d_kz TEXT,
  ADD COLUMN IF NOT EXISTS topic TEXT,
  ADD COLUMN IF NOT EXISTS difficulty SMALLINT CHECK (difficulty BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.import_questions
  ADD COLUMN IF NOT EXISTS topic TEXT;

-- ────────────────────────────────────────────────────────────────────
-- 2. Картинки вопросов: публичный bucket, загружает только админ
-- ────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "question_images_admin_write" ON storage.objects;
CREATE POLICY "question_images_admin_write" ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'question-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'question-images' AND public.is_admin());

-- ────────────────────────────────────────────────────────────────────
-- 3. Публикация импорта: сохраняем оба языка и тему
--    Казахский текст пишется, только если он отличается от основного.
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
  v_text TEXT;
  v_a TEXT;
  v_b TEXT;
  v_c TEXT;
  v_d TEXT;
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
      v_text := COALESCE(NULLIF(q.question_ru, ''), NULLIF(q.question_kz, ''), '');
      v_a := COALESCE(NULLIF(q.option_a_ru, ''), NULLIF(q.option_a_kz, ''), '');
      v_b := COALESCE(NULLIF(q.option_b_ru, ''), NULLIF(q.option_b_kz, ''), '');
      v_c := COALESCE(NULLIF(q.option_c_ru, ''), NULLIF(q.option_c_kz, ''), '');
      v_d := COALESCE(NULLIF(q.option_d_ru, ''), NULLIF(q.option_d_kz, ''), '');

      SELECT COALESCE(MAX(order_num), 0) + 1 INTO v_order FROM public.questions WHERE variant_id = p_variant_id;
      INSERT INTO public.questions (
        variant_id, question_text,
        option_a, option_b, option_c, option_d,
        question_text_kz,
        option_a_kz, option_b_kz, option_c_kz, option_d_kz,
        correct_answer, score, order_num, topic
      ) VALUES (
        p_variant_id, v_text,
        v_a, v_b, v_c, v_d,
        NULLIF(NULLIF(q.question_kz, ''), v_text),
        NULLIF(NULLIF(q.option_a_kz, ''), v_a),
        NULLIF(NULLIF(q.option_b_kz, ''), v_b),
        NULLIF(NULLIF(q.option_c_kz, ''), v_c),
        NULLIF(NULLIF(q.option_d_kz, ''), v_d),
        q.correct_answer,
        1,
        v_order,
        NULLIF(TRIM(q.topic), '')
      );
      UPDATE public.import_questions
      SET status = 'published', updated_at = NOW()
      WHERE id = q.id;
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

-- ────────────────────────────────────────────────────────────────────
-- 4. Вопрос для ученика: оба языка, картинка, тема — без правильного ответа.
--    Язык выбирает клиент, поэтому переключение языка во время теста мгновенное.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.question_public_json(q public.questions)
RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', q.id,
    'variant_id', q.variant_id,
    'question_text', q.question_text,
    'option_a', q.option_a,
    'option_b', q.option_b,
    'option_c', q.option_c,
    'option_d', q.option_d,
    'question_text_kz', q.question_text_kz,
    'option_a_kz', q.option_a_kz,
    'option_b_kz', q.option_b_kz,
    'option_c_kz', q.option_c_kz,
    'option_d_kz', q.option_d_kz,
    'image_url', q.image_url,
    'topic', q.topic,
    'difficulty', q.difficulty,
    'score', q.score,
    'order_num', q.order_num
  )
$$;

-- Вспомогательная функция: напрямую её вызывать незачем
REVOKE EXECUTE ON FUNCTION public.question_public_json(public.questions) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.start_test_attempt(p_variant_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  q_count INTEGER;
  v_questions JSONB;
  v_attempt public.test_attempts;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_user_blocked(uid) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.variants WHERE id = p_variant_id) THEN
    RAISE EXCEPTION 'Вариант не найден';
  END IF;

  SELECT COUNT(*)::INTEGER,
         COALESCE(jsonb_agg(public.question_public_json(q) ORDER BY q.order_num, q.id), '[]'::jsonb)
  INTO q_count, v_questions
  FROM public.questions q
  WHERE q.variant_id = p_variant_id;

  IF q_count = 0 THEN
    RETURN jsonb_build_object('attempt', NULL, 'server_now', NOW(), 'questions', '[]'::jsonb);
  END IF;

  -- Брошенная попытка с истёкшим временем закрывается, вместо неё начинается новая
  UPDATE public.test_attempts
  SET status = 'expired'
  WHERE student_id = uid AND variant_id = p_variant_id
    AND status = 'open' AND expires_at <= NOW();

  SELECT * INTO v_attempt
  FROM public.test_attempts
  WHERE student_id = uid AND variant_id = p_variant_id AND status = 'open';

  IF NOT FOUND THEN
    BEGIN
      -- 1 минута на вопрос
      INSERT INTO public.test_attempts (student_id, variant_id, expires_at)
      VALUES (uid, p_variant_id, NOW() + make_interval(secs => q_count * 60))
      RETURNING * INTO v_attempt;
    EXCEPTION WHEN unique_violation THEN
      -- параллельный запрос из второй вкладки уже создал попытку
      SELECT * INTO v_attempt
      FROM public.test_attempts
      WHERE student_id = uid AND variant_id = p_variant_id AND status = 'open';
    END;
  END IF;

  RETURN jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'server_now', NOW(),
    'questions', v_questions
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 5. Разбор попытки и вопрос для объяснения — тоже с обоими языками
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_result_review(p_result_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_row public.results;
  v_questions JSONB;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_row FROM public.results WHERE id = p_result_id;
  IF NOT FOUND OR (v_row.student_id <> uid AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'Результат не найден';
  END IF;

  SELECT COALESCE(jsonb_agg(
           public.question_public_json(q) || jsonb_build_object(
             'correct_answer', q.correct_answer,
             'explanation_ru', q.explanation_ru,
             'explanation_kz', q.explanation_kz
           ) ORDER BY q.order_num, q.id), '[]'::jsonb)
  INTO v_questions
  FROM public.questions q
  WHERE q.variant_id = v_row.variant_id;

  RETURN jsonb_build_object('result', to_jsonb(v_row), 'questions', v_questions);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_question_for_explain(p_question_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT public.question_public_json(q) || jsonb_build_object(
           'correct_answer', q.correct_answer,
           'explanation_ru', q.explanation_ru,
           'explanation_kz', q.explanation_kz,
           'subject', s.name
         )
  INTO v_result
  FROM public.questions q
  JOIN public.variants v ON v.id = q.variant_id
  JOIN public.subjects s ON s.id = v.subject_id
  WHERE q.id = p_question_id
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.results r
        WHERE r.student_id = uid AND r.variant_id = q.variant_id
      )
    );

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Вопрос недоступен';
  END IF;
  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 6. Статистика ученика по предметам и темам.
--    Берётся первая попытка каждого варианта: после неё ученик видел ключ,
--    и пересдача уже не показывает, что он знает на самом деле.
--    topic = NULL — вопросы, которым тема не задана.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_topic_stats()
RETURNS TABLE (
  subject text,
  topic text,
  total bigint,
  correct bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY
  SELECT x.subj, x.top, x.tot, x.cor
  FROM (
    SELECT s.name::text AS subj,
           NULLIF(TRIM(q.topic), '') AS top,
           COUNT(*)::bigint AS tot,
           (COUNT(*) FILTER (WHERE fr.answers ->> q.id::text = q.correct_answer))::bigint AS cor
    FROM (
      SELECT DISTINCT ON (r.variant_id) r.variant_id, r.answers
      FROM public.results r
      WHERE r.student_id = me
      ORDER BY r.variant_id, r.taken_at, r.id
    ) fr
    JOIN public.questions q ON q.variant_id = fr.variant_id
    JOIN public.variants v ON v.id = q.variant_id
    JOIN public.subjects s ON s.id = v.subject_id
    WHERE fr.answers IS NOT NULL
    GROUP BY s.name, NULLIF(TRIM(q.topic), '')
  ) x
  ORDER BY x.subj, x.top;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 7. Права доступа
-- ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_my_topic_stats() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_topic_stats() FROM anon, public;
