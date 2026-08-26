-- ═══════════════════════════════════════════════════════════════════
-- SUBMIT TEST RESULT RPC (server-side write control)
-- saveTestResult тікелей insert-ын RPC-ге ауыстыру — клиентті айналып өтуден қорғайды.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_test_result(
  p_student_id UUID,
  p_variant_id BIGINT,
  p_score INTEGER,
  p_total_score INTEGER,
  p_answers JSONB DEFAULT NULL
)
RETURNS SETOF public.results
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  q_count INTEGER;
BEGIN
  -- 0. Тек өз нәтижесін ғана жазуға болады (client spoofing қорғанысы)
  IF auth.uid() IS NULL OR p_student_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: cannot submit result for another user';
  END IF;

  -- 1. Блокталған пайдаланушыға тыйым
  IF public.is_user_blocked(p_student_id) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;

  -- 2. Валидация баллов (дублирует validate_result_score trigger, но на уровне RPC)
  IF p_score < 0 THEN
    RAISE EXCEPTION 'score cannot be negative';
  END IF;
  SELECT COUNT(*) INTO q_count FROM public.questions WHERE variant_id = p_variant_id;
  IF p_total_score <> q_count THEN
    RAISE EXCEPTION 'total_score не соответствует количеству вопросов варианта';
  END IF;
  IF p_score > p_total_score THEN
    RAISE EXCEPTION 'score не может превышать total_score';
  END IF;

  -- 3. Вставка (триггер validate_result_score тоже сработает, RPC — дополнительный слой)
  RETURN QUERY
  INSERT INTO public.results (student_id, variant_id, score, total_score, answers)
  VALUES (p_student_id, p_variant_id, p_score, p_total_score, p_answers)
  RETURNING *;
END;
$$;

-- Колонка answers (JSONB: {question_id: 'A'|'B'|'C'|'D'}) — для просмотра ответов после теста
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS answers JSONB;

GRANT EXECUTE ON FUNCTION public.submit_test_result(UUID, BIGINT, INTEGER, INTEGER, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_test_result(UUID, BIGINT, INTEGER, INTEGER, JSONB) FROM anon;