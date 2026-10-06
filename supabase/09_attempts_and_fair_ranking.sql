-- ═══════════════════════════════════════════════════════════════════
-- ATTEMPTS + FAIR RANKING + ANSWER REVIEW
--   • попытка теста живёт на сервере: время старта и дедлайн знает сервер,
--     обновление страницы таймер не сбрасывает (start_test_attempt)
--   • в рейтинг идёт только первая попытка варианта, сданная вовремя
--     (results.is_ranked) — пересдача после просмотра ключа рейтинг не меняет
--   • лидерборд считается по сумме баллов, есть недельный период
--   • streak считается по времени Алматы, а не UTC
--   • разбор ответов любой своей попытки (get_result_review)
--   • объяснения вопросов хранятся в questions.explanation_ru / _kz
-- Запускать после 08_server_side_scoring.sql.
-- Старая сборка student продолжит работать, но её результаты не попадут
-- в рейтинг (нет серверной попытки) — выкладывайте новую сборку следом.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Новые колонки и таблица попыток
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS explanation_ru TEXT,
  ADD COLUMN IF NOT EXISTS explanation_kz TEXT;

ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS attempt_id BIGINT,
  ADD COLUMN IF NOT EXISTS is_ranked BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

CREATE TABLE IF NOT EXISTS public.test_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ
);

-- У ученика не больше одной открытой попытки на вариант
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_one_open
  ON public.test_attempts(student_id, variant_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_results_student_variant
  ON public.results(student_id, variant_id, taken_at);

ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

-- Попытки создаёт и закрывает только RPC; ученик может их читать
DROP POLICY IF EXISTS "select_own_attempts" ON public.test_attempts;
CREATE POLICY "select_own_attempts" ON public.test_attempts FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

-- Проверка блокировки нужна только при записи нового результата: на UPDATE
-- она мешала служебным правкам строк заблокированных пользователей.
DROP TRIGGER IF EXISTS results_blocked_check ON public.results;
CREATE TRIGGER results_blocked_check
  BEFORE INSERT ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.check_not_blocked();

-- Уже накопленные результаты: в рейтинге остаётся только первая попытка варианта
UPDATE public.results r
SET is_ranked = FALSE
WHERE r.is_ranked
  AND EXISTS (
    SELECT 1 FROM public.results e
    WHERE e.student_id = r.student_id
      AND e.variant_id = r.variant_id
      AND (e.taken_at < r.taken_at OR (e.taken_at = r.taken_at AND e.id < r.id))
  );

-- ────────────────────────────────────────────────────────────────────
-- 2. Старт попытки: вопросы без ответов + серверный дедлайн
--    Незавершённая попытка с неистёкшим временем продолжается.
--    Ответ: {"attempt": <строка test_attempts> | null, "server_now": ..., "questions": [...]}
-- ────────────────────────────────────────────────────────────────────
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
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'variant_id', q.variant_id,
           'question_text', q.question_text,
           'option_a', q.option_a,
           'option_b', q.option_b,
           'option_c', q.option_c,
           'option_d', q.option_d,
           'score', q.score,
           'order_num', q.order_num
         ) ORDER BY q.order_num, q.id), '[]'::jsonb)
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
-- 3. Сдача теста: балл считает сервер, попытка закрывается.
--    is_ranked = первая попытка варианта + есть серверная попытка + сдано вовремя
--    (30 секунд запаса на сеть). Остальные результаты сохраняются, но в рейтинг не идут.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_test_result(
  p_variant_id BIGINT,
  p_answers JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_answers JSONB := COALESCE(p_answers, '{}'::jsonb);
  v_clean JSONB;
  v_key JSONB;
  q_count INTEGER;
  v_score INTEGER;
  v_attempt public.test_attempts;
  v_ranked BOOLEAN := FALSE;
  v_duration INTEGER;
  v_row public.results;
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
  IF jsonb_typeof(v_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers must be a JSON object';
  END IF;

  SELECT COUNT(*)::INTEGER,
         (COUNT(*) FILTER (WHERE v_answers ->> q.id::text = q.correct_answer))::INTEGER,
         COALESCE(jsonb_object_agg(q.id::text, q.correct_answer), '{}'::jsonb)
  INTO q_count, v_score, v_key
  FROM public.questions q
  WHERE q.variant_id = p_variant_id;

  -- В results сохраняем только ответы на вопросы этого варианта
  SELECT COALESCE(jsonb_object_agg(q.id::text, v_answers ->> q.id::text), '{}'::jsonb)
  INTO v_clean
  FROM public.questions q
  WHERE q.variant_id = p_variant_id
    AND v_answers ->> q.id::text IN ('A', 'B', 'C', 'D');

  SELECT * INTO v_attempt
  FROM public.test_attempts
  WHERE student_id = uid AND variant_id = p_variant_id AND status = 'open'
  FOR UPDATE;

  IF FOUND THEN
    v_ranked := NOW() <= v_attempt.expires_at + INTERVAL '30 seconds';
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_attempt.started_at))::INTEGER);
  END IF;

  IF EXISTS (SELECT 1 FROM public.results WHERE student_id = uid AND variant_id = p_variant_id) THEN
    v_ranked := FALSE;
  END IF;

  INSERT INTO public.results (student_id, variant_id, score, total_score, answers, attempt_id, is_ranked, duration_seconds)
  VALUES (uid, p_variant_id, v_score, q_count, v_clean, v_attempt.id, v_ranked, v_duration)
  RETURNING * INTO v_row;

  IF v_attempt.id IS NOT NULL THEN
    UPDATE public.test_attempts
    SET status = 'submitted', submitted_at = NOW()
    WHERE id = v_attempt.id;
  END IF;

  RETURN jsonb_build_object('result', to_jsonb(v_row), 'answer_key', v_key);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 4. Разбор своей попытки: результат + вопросы с правильными ответами
--    Ключ ученик уже видел при сдаче, поэтому отдаём его только владельцу результата.
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'variant_id', q.variant_id,
           'question_text', q.question_text,
           'option_a', q.option_a,
           'option_b', q.option_b,
           'option_c', q.option_c,
           'option_d', q.option_d,
           'correct_answer', q.correct_answer,
           'score', q.score,
           'order_num', q.order_num,
           'explanation_ru', q.explanation_ru,
           'explanation_kz', q.explanation_kz
         ) ORDER BY q.order_num, q.id), '[]'::jsonb)
  INTO v_questions
  FROM public.questions q
  WHERE q.variant_id = v_row.variant_id;

  RETURN jsonb_build_object('result', to_jsonb(v_row), 'questions', v_questions);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 5. Вопрос для объяснения ИИ (вызывает Edge Function ai-chat от имени ученика).
--    Доступен только тем, кто уже сдавал этот вариант, и админу.
-- ────────────────────────────────────────────────────────────────────
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

  SELECT jsonb_build_object(
           'id', q.id,
           'question_text', q.question_text,
           'option_a', q.option_a,
           'option_b', q.option_b,
           'option_c', q.option_c,
           'option_d', q.option_d,
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
-- 6. Лидерборд: сумма баллов по зачётным результатам, период all | week
--    Неделя начинается в понедельник по времени Алматы.
-- ────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_leaderboard();
DROP FUNCTION IF EXISTS public.get_leaderboard(TEXT);
CREATE FUNCTION public.get_leaderboard(p_period TEXT DEFAULT 'all')
RETURNS TABLE (
  user_id uuid,
  nickname text,
  tests_count bigint,
  avg_percent numeric,
  best_percent numeric,
  total_points bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from TIMESTAMPTZ := CASE WHEN p_period = 'week'
    THEN date_trunc('week', NOW() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty'
    ELSE '-infinity'::timestamptz END;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY
  SELECT s.uid, s.nick, s.cnt, s.avg_pct, s.best_pct, s.pts
  FROM (
    SELECT p.id AS uid,
           COALESCE(NULLIF(p.nickname, ''),
                    NULLIF(TRIM(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')), ''),
                    'Аноним') AS nick,
           COUNT(r.id)::bigint AS cnt,
           ROUND(AVG(r.score::numeric / r.total_score) * 100) AS avg_pct,
           MAX(ROUND(r.score::numeric / r.total_score * 100)) AS best_pct,
           SUM(r.score)::bigint AS pts
    FROM public.results r
    JOIN public.profiles p ON p.id = r.student_id
    WHERE r.is_ranked
      AND r.total_score > 0
      AND r.taken_at >= v_from
      AND NOT COALESCE(p.is_blocked, false)
    GROUP BY p.id, p.nickname, p.last_name, p.first_name
  ) s
  ORDER BY s.pts DESC, s.avg_pct DESC, s.uid
  LIMIT 10;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_rank();
DROP FUNCTION IF EXISTS public.get_my_rank(TEXT);
CREATE FUNCTION public.get_my_rank(p_period TEXT DEFAULT 'all')
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  nickname text,
  avg_percent numeric,
  tests_count bigint,
  total_points bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  v_from TIMESTAMPTZ := CASE WHEN p_period = 'week'
    THEN date_trunc('week', NOW() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty'
    ELSE '-infinity'::timestamptz END;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF public.is_user_blocked(me) THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.pos, s.uid, s.nick, s.avg_pct, s.cnt, s.pts
  FROM (
    SELECT p.id AS uid,
           COALESCE(NULLIF(p.nickname, ''),
                    NULLIF(TRIM(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')), ''),
                    'Аноним') AS nick,
           COUNT(r.id)::bigint AS cnt,
           ROUND(AVG(r.score::numeric / r.total_score) * 100) AS avg_pct,
           SUM(r.score)::bigint AS pts,
           ROW_NUMBER() OVER (
             ORDER BY SUM(r.score) DESC, AVG(r.score::numeric / r.total_score) DESC, p.id
           )::bigint AS pos
    FROM public.results r
    JOIN public.profiles p ON p.id = r.student_id
    WHERE r.is_ranked
      AND r.total_score > 0
      AND r.taken_at >= v_from
      AND NOT COALESCE(p.is_blocked, false)
    GROUP BY p.id, p.nickname, p.last_name, p.first_name
  ) s
  WHERE s.uid = me;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 7. Streak по времени Алматы и бейдж 90%+ только за зачётную попытку
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_streak(p_user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := COALESCE(p_user, auth.uid());
  today date := (NOW() AT TIME ZONE 'Asia/Almaty')::date;
  d date;
  streak integer := 0;
  day_exists boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF public.is_user_blocked(uid) THEN RETURN 0; END IF;

  -- Если сегодня тестов ещё не было — серия считается со вчерашнего дня
  d := today;
  IF NOT EXISTS (
    SELECT 1 FROM public.results
    WHERE student_id = uid AND (taken_at AT TIME ZONE 'Asia/Almaty')::date = today
  ) THEN
    d := today - 1;
  END IF;

  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.results
      WHERE student_id = uid AND (taken_at AT TIME ZONE 'Asia/Almaty')::date = d
    ) INTO day_exists;
    EXIT WHEN NOT day_exists;
    streak := streak + 1;
    d := d - 1;
  END LOOP;

  RETURN streak;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_badges()
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  badges text[] := '{}'::text[];
  n_tests bigint;
  has_90 boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF public.is_user_blocked(uid) THEN RETURN '{}'::text[]; END IF;

  SELECT COUNT(DISTINCT variant_id) INTO n_tests FROM public.results WHERE student_id = uid;

  SELECT EXISTS (
    SELECT 1 FROM public.results
    WHERE student_id = uid AND is_ranked AND total_score > 0
      AND (score::numeric / total_score) >= 0.9
  ) INTO has_90;

  IF n_tests >= 1   THEN badges := array_append(badges, 'first_test');       END IF;
  IF n_tests >= 10  THEN badges := array_append(badges, 'ten_tests');        END IF;
  IF n_tests >= 25  THEN badges := array_append(badges, 'twenty_five_tests'); END IF;
  IF has_90         THEN badges := array_append(badges, 'high_score');       END IF;

  RETURN badges;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 8. Права доступа
-- ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.start_test_attempt(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_result(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_result_review(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_for_explain(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rank(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_streak(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.start_test_attempt(BIGINT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_test_result(BIGINT, JSONB) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_result_review(BIGINT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_question_for_explain(BIGINT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_rank(TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_streak(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_badges() FROM anon, public;
