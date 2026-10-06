-- ═══════════════════════════════════════════════════════════════════
-- SERVER-SIDE SCORING
-- Балл считается на сервере, правильные ответы ученику до сдачи не отдаются.
--   • ученик читает вопросы только через get_test_questions() (без correct_answer)
--   • submit_test_result() сам считает score по присланным ответам
--   • прямой SELECT из questions и прямой INSERT в results — только админ / RPC
-- ВАЖНО: после запуска старая версия сайта перестанет работать —
--        выкладывайте новую сборку student-приложения сразу после этого файла.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.results ADD COLUMN IF NOT EXISTS answers JSONB;

-- ────────────────────────────────────────────────────────────────────
-- 1. Вопросы варианта для прохождения теста (без правильных ответов)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_test_questions(p_variant_id BIGINT)
RETURNS TABLE (
  id BIGINT,
  variant_id BIGINT,
  question_text TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  score INTEGER,
  order_num INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_user_blocked(auth.uid()) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;

  RETURN QUERY
  SELECT q.id, q.variant_id, q.question_text,
         q.option_a, q.option_b, q.option_c, q.option_d,
         q.score, q.order_num
  FROM public.questions q
  WHERE q.variant_id = p_variant_id
  ORDER BY q.order_num, q.id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 2. Сдача теста: сервер считает балл и возвращает результат + ключ ответов
--    p_answers: {"<question_id>": "A"|"B"|"C"|"D"}
--    Ответ:     {"result": <строка results>, "answer_key": {"<question_id>": "A"}}
-- ────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_test_result(UUID, BIGINT, INTEGER, INTEGER, JSONB);

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

  INSERT INTO public.results (student_id, variant_id, score, total_score, answers)
  VALUES (uid, p_variant_id, v_score, q_count, v_clean)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('result', to_jsonb(v_row), 'answer_key', v_key);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 3. RLS: закрываем обходные пути
-- ────────────────────────────────────────────────────────────────────
-- Вопросы (с correct_answer) напрямую читает только админ
DROP POLICY IF EXISTS "select_questions" ON public.questions;
DROP POLICY IF EXISTS "admin_read_questions" ON public.questions;
CREATE POLICY "admin_read_questions" ON public.questions FOR SELECT
  TO authenticated USING (public.is_admin());

-- Результаты пишутся только через submit_test_result()
DROP POLICY IF EXISTS "insert_own_results" ON public.results;

-- ────────────────────────────────────────────────────────────────────
-- 4. Права доступа
-- ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_test_questions(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_result(BIGINT, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_test_questions(BIGINT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_test_result(BIGINT, JSONB) FROM anon, public;
