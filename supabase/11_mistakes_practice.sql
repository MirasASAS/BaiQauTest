-- ═══════════════════════════════════════════════════════════════════
-- MISTAKES PRACTICE («работа над ошибками»)
--   • ошибка = вопрос, на который ученик ответил неверно или не ответил
--     в первой попытке варианта (после неё он видел ключ, пересдача не показатель)
--   • ошибка считается исправленной, когда ученик верно ответил на вопрос
--     в тренировке (mistake_practice.last_correct)
--   • ключ в тренировке отдаётся сразу: ученик уже видел его при сдаче варианта
-- Запускать после 10_bilingual_content.sql.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mistake_practice (
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  last_correct BOOLEAN NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, question_id)
);

ALTER TABLE public.mistake_practice ENABLE ROW LEVEL SECURITY;

-- Пишет только RPC record_mistake_practice; ученик может читать свои строки
DROP POLICY IF EXISTS "select_own_mistake_practice" ON public.mistake_practice;
CREATE POLICY "select_own_mistake_practice" ON public.mistake_practice FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

-- ────────────────────────────────────────────────────────────────────
-- 1. Неисправленные ошибки ученика
--    p_subject_id — только по одному предмету (NULL — по всем)
--    Ответ: {"total": N, "by_subject": [{"subject_id","subject","count"}],
--            "questions": [до p_limit вопросов с ключом и ответом ученика]}
--    total и by_subject считаются по всем предметам, чтобы фильтр было из чего выбрать.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_mistakes(
  p_subject_id BIGINT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_total INTEGER;
  v_by_subject JSONB;
  v_questions JSONB;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_user_blocked(me) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;

  WITH first_results AS (
    SELECT DISTINCT ON (r.variant_id) r.variant_id, r.answers, r.taken_at
    FROM public.results r
    WHERE r.student_id = me
    ORDER BY r.variant_id, r.taken_at, r.id
  ),
  mistakes AS (
    SELECT q.id AS question_id, s.id AS subject_id, s.name AS subject,
           fr.answers ->> q.id::text AS my_answer, fr.taken_at
    FROM first_results fr
    JOIN public.questions q ON q.variant_id = fr.variant_id
    JOIN public.variants v ON v.id = q.variant_id
    JOIN public.subjects s ON s.id = v.subject_id
    WHERE fr.answers IS NOT NULL
      AND (fr.answers ->> q.id::text) IS DISTINCT FROM q.correct_answer
      AND NOT EXISTS (
        SELECT 1 FROM public.mistake_practice mp
        WHERE mp.student_id = me AND mp.question_id = q.id AND mp.last_correct
      )
  ),
  counts AS (
    SELECT m.subject_id, m.subject, COUNT(*)::INTEGER AS cnt
    FROM mistakes m
    GROUP BY m.subject_id, m.subject
  ),
  picked AS (
    SELECT m.*
    FROM mistakes m
    WHERE p_subject_id IS NULL OR m.subject_id = p_subject_id
    -- сначала свежие ошибки
    ORDER BY m.taken_at DESC, m.question_id
    LIMIT v_limit
  )
  SELECT
    COALESCE((SELECT SUM(c.cnt) FROM counts c), 0)::INTEGER,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('subject_id', c.subject_id, 'subject', c.subject, 'count', c.cnt)
                               ORDER BY c.cnt DESC, c.subject) FROM counts c), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(
                public.question_public_json(q) || jsonb_build_object(
                  'correct_answer', q.correct_answer,
                  'explanation_ru', q.explanation_ru,
                  'explanation_kz', q.explanation_kz,
                  'subject', p.subject,
                  'my_answer', p.my_answer
                ) ORDER BY p.taken_at DESC, p.question_id)
              FROM picked p JOIN public.questions q ON q.id = p.question_id), '[]'::jsonb)
  INTO v_total, v_by_subject, v_questions;

  RETURN jsonb_build_object('total', v_total, 'by_subject', v_by_subject, 'questions', v_questions);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 2. Ответ в тренировке: сервер сам проверяет его и запоминает результат.
--    Доступно только по вопросам вариантов, которые ученик уже сдавал.
--    Ответ: {"is_correct": bool, "correct_answer": "A"}
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_mistake_practice(p_question_id BIGINT, p_answer TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  v_correct TEXT;
  v_ok BOOLEAN;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_user_blocked(me) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;
  IF p_answer IS NULL OR p_answer NOT IN ('A', 'B', 'C', 'D') THEN
    RAISE EXCEPTION 'answer must be A, B, C or D';
  END IF;

  SELECT q.correct_answer INTO v_correct
  FROM public.questions q
  WHERE q.id = p_question_id
    AND EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.student_id = me AND r.variant_id = q.variant_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Вопрос недоступен';
  END IF;

  v_ok := (p_answer = v_correct);

  INSERT INTO public.mistake_practice (student_id, question_id, last_correct)
  VALUES (me, p_question_id, v_ok)
  ON CONFLICT (student_id, question_id) DO UPDATE
  SET last_correct = EXCLUDED.last_correct,
      attempts = public.mistake_practice.attempts + 1,
      updated_at = NOW();

  RETURN jsonb_build_object('is_correct', v_ok, 'correct_answer', v_correct);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_mistakes(BIGINT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_mistake_practice(BIGINT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_mistakes(BIGINT, INTEGER) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_mistake_practice(BIGINT, TEXT) FROM anon, public;
