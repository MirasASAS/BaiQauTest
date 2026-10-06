-- ═══════════════════════════════════════════════════════════════════
-- QUESTION TYPES + FULL ЕНТ MODE
--   • типы вопросов: single (один ответ), multiple (несколько верных, до 6 вариантов A–F),
--     matching (соответствие: утверждения слева ↔ варианты A–F)
--   • контекстные вопросы: общий текст (passages), к которому привязаны вопросы
--   • баллы как на ЕНТ: single — 1; multiple — 2 (одна ошибка — 1, две и больше — 0);
--     matching — по 1 баллу за каждую верную пару
--   • variants.total_score = сумма баллов вопросов (а не их количество)
--   • полный ЕНТ: одна попытка из нескольких предметов с общим таймером
--     (start_full_exam / submit_full_exam), результат пишется в results по каждому
--     предмету, поэтому история, рейтинг, темы и работа над ошибками работают как раньше
-- Запускать после 11_mistakes_practice.sql.
-- Если позже повторно запускаете 09, 10 или 11 — после них снова запустите этот файл:
-- он переопределяет submit_test_result, get_result_review, get_question_for_explain,
-- get_my_topic_stats, get_my_mistakes и record_mistake_practice.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Контекстные тексты и новые колонки вопросов
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.passages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id BIGINT NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  title TEXT,
  text_ru TEXT NOT NULL,
  text_kz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passages_variant_id ON public.passages(variant_id);

ALTER TABLE public.passages ENABLE ROW LEVEL SECURITY;

-- Тексты ученик получает вместе с вопросами через RPC; напрямую таблицу видит только админ
DROP POLICY IF EXISTS "admin_all_passages" ON public.passages;
CREATE POLICY "admin_all_passages" ON public.passages FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'single'
    CHECK (question_type IN ('single', 'multiple', 'matching')),
  ADD COLUMN IF NOT EXISTS option_e TEXT,
  ADD COLUMN IF NOT EXISTS option_f TEXT,
  ADD COLUMN IF NOT EXISTS option_e_kz TEXT,
  ADD COLUMN IF NOT EXISTS option_f_kz TEXT,
  -- multiple: ["A","C","E"]; matching: {"1":"B","2":"D"}; single: NULL (ключ в correct_answer)
  ADD COLUMN IF NOT EXISTS correct_key JSONB,
  -- matching: утверждения слева — [{"ru":"...","kz":"..."}, ...]
  ADD COLUMN IF NOT EXISTS match_left JSONB,
  ADD COLUMN IF NOT EXISTS passage_id BIGINT REFERENCES public.passages(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_key_shape') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_key_shape CHECK (
      question_type = 'single'
      -- IS NOT NULL обязателен: без него CHECK с NULL-ключом считался бы пройденным
      OR (question_type = 'multiple' AND correct_key IS NOT NULL AND jsonb_typeof(correct_key) = 'array')
      OR (question_type = 'matching' AND correct_key IS NOT NULL AND match_left IS NOT NULL
          AND jsonb_typeof(correct_key) = 'object' AND jsonb_typeof(match_left) = 'array')
    );
  END IF;
END $$;

-- Максимальный балл вопроса задаёт сервер по типу вопроса
CREATE OR REPLACE FUNCTION public.questions_set_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.question_type = 'multiple' THEN
    NEW.score := 2;
  ELSIF NEW.question_type = 'matching' THEN
    NEW.score := GREATEST(1, jsonb_array_length(NEW.match_left));
  ELSE
    NEW.score := 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_set_score_trigger ON public.questions;
CREATE TRIGGER questions_set_score_trigger
  BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.questions_set_score();

UPDATE public.questions SET score = 1 WHERE question_type = 'single' AND score <> 1;

-- ────────────────────────────────────────────────────────────────────
-- 2. variants.total_score = сумма баллов вопросов.
--    Значение всегда пересчитывает сервер, что бы ни прислал клиент или старая функция.
-- ────────────────────────────────────────────────────────────────────
-- Сам пересчёт делает триггер variants_force_total_score: здесь вариант достаточно «тронуть».
CREATE OR REPLACE FUNCTION public.sync_variant_total_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.variants SET total_score = 0 WHERE id = OLD.variant_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.variant_id IS DISTINCT FROM OLD.variant_id) THEN
    UPDATE public.variants SET total_score = 0 WHERE id = NEW.variant_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_variant_total_score_trigger ON public.questions;
CREATE TRIGGER sync_variant_total_score_trigger
  AFTER INSERT OR DELETE OR UPDATE OF variant_id, score, question_type, match_left ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.sync_variant_total_score();

CREATE OR REPLACE FUNCTION public.variants_force_total_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.total_score := COALESCE((SELECT SUM(q.score) FROM public.questions q WHERE q.variant_id = NEW.id), 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variants_force_total_score_trigger ON public.variants;
CREATE TRIGGER variants_force_total_score_trigger
  BEFORE UPDATE ON public.variants
  FOR EACH ROW EXECUTE FUNCTION public.variants_force_total_score();

UPDATE public.variants SET total_score = 0;

-- Проверка строки results: максимум теперь равен сумме баллов вопросов варианта
CREATE OR REPLACE FUNCTION public.validate_result_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.score = NEW.score AND OLD.total_score = NEW.total_score AND OLD.variant_id = NEW.variant_id THEN
    RETURN NEW;
  END IF;
  IF NEW.score < 0 THEN
    RAISE EXCEPTION 'score cannot be negative';
  END IF;
  SELECT COALESCE(SUM(score), 0) INTO v_max FROM public.questions WHERE variant_id = NEW.variant_id;
  IF NEW.total_score <> v_max THEN
    RAISE EXCEPTION 'total_score не соответствует сумме баллов варианта';
  END IF;
  IF NEW.score > NEW.total_score THEN
    RAISE EXCEPTION 'score не может превышать total_score';
  END IF;
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 3. Проверка ответа.
--    Формат ответа ученика: single — "A"; multiple — ["A","C"]; matching — {"1":"B","2":"D"}
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.score_answer(q public.questions, a JSONB)
RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_errors INTEGER;
  v_hits INTEGER;
BEGIN
  IF a IS NULL OR jsonb_typeof(a) = 'null' THEN
    RETURN 0;
  END IF;

  IF q.question_type = 'multiple' THEN
    IF jsonb_typeof(a) <> 'array' OR jsonb_typeof(q.correct_key) <> 'array' OR jsonb_array_length(a) = 0 THEN
      RETURN 0;
    END IF;
    -- ошибка = лишний выбранный вариант или пропущенный верный
    SELECT
      (SELECT COUNT(DISTINCT p.x) FROM jsonb_array_elements_text(a) p(x) WHERE NOT (q.correct_key ? p.x))
      + (SELECT COUNT(*) FROM jsonb_array_elements_text(q.correct_key) k(x) WHERE NOT (a ? k.x))
    INTO v_errors;
    RETURN GREATEST(0, q.score - v_errors);
  END IF;

  IF q.question_type = 'matching' THEN
    IF jsonb_typeof(a) <> 'object' OR jsonb_typeof(q.correct_key) <> 'object' THEN
      RETURN 0;
    END IF;
    SELECT COUNT(*) INTO v_hits
    FROM jsonb_each_text(q.correct_key) k
    WHERE a ->> k.key = k.value;
    RETURN LEAST(q.score, v_hits);
  END IF;

  IF jsonb_typeof(a) = 'string' AND (a #>> '{}') = q.correct_answer THEN
    RETURN q.score;
  END IF;
  RETURN 0;
END;
$$;

-- Ответ в том виде, в каком его можно хранить: только допустимые значения, NULL — ответа нет
CREATE OR REPLACE FUNCTION public.clean_answer(q public.questions, a JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF a IS NULL THEN
    RETURN NULL;
  END IF;

  IF q.question_type = 'multiple' THEN
    IF jsonb_typeof(a) <> 'array' THEN RETURN NULL; END IF;
    SELECT jsonb_agg(d.x ORDER BY d.x) INTO v_result
    FROM (
      SELECT DISTINCT p.x FROM jsonb_array_elements_text(a) p(x)
      WHERE p.x IN ('A', 'B', 'C', 'D', 'E', 'F')
    ) d;
    RETURN v_result;
  END IF;

  IF q.question_type = 'matching' THEN
    IF jsonb_typeof(a) <> 'object' THEN RETURN NULL; END IF;
    SELECT jsonb_object_agg(e.key, e.value) INTO v_result
    FROM jsonb_each_text(a) e
    WHERE e.key ~ '^[1-9]$' AND e.value IN ('A', 'B', 'C', 'D', 'E', 'F');
    RETURN v_result;
  END IF;

  IF jsonb_typeof(a) = 'string' AND (a #>> '{}') IN ('A', 'B', 'C', 'D') THEN
    RETURN a;
  END IF;
  RETURN NULL;
END;
$$;

-- Ключ вопроса одним значением: "A" | ["A","C"] | {"1":"B"}
CREATE OR REPLACE FUNCTION public.question_key_json(q public.questions)
RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN q.question_type = 'single' THEN to_jsonb(q.correct_answer) ELSE q.correct_key END
$$;

REVOKE EXECUTE ON FUNCTION public.score_answer(public.questions, JSONB) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.clean_answer(public.questions, JSONB) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.question_key_json(public.questions) FROM anon, authenticated, public;

-- ────────────────────────────────────────────────────────────────────
-- 4. Вопрос для ученика: тип, варианты E–F, утверждения, контекстный текст — без ключа
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.question_public_json(q public.questions)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', q.id,
    'variant_id', q.variant_id,
    'question_type', q.question_type,
    'question_text', q.question_text,
    'option_a', q.option_a,
    'option_b', q.option_b,
    'option_c', q.option_c,
    'option_d', q.option_d,
    'option_e', q.option_e,
    'option_f', q.option_f,
    'question_text_kz', q.question_text_kz,
    'option_a_kz', q.option_a_kz,
    'option_b_kz', q.option_b_kz,
    'option_c_kz', q.option_c_kz,
    'option_d_kz', q.option_d_kz,
    'option_e_kz', q.option_e_kz,
    'option_f_kz', q.option_f_kz,
    'match_left', q.match_left,
    'image_url', q.image_url,
    'topic', q.topic,
    'difficulty', q.difficulty,
    'score', q.score,
    'order_num', q.order_num,
    'passage_id', q.passage_id,
    'passage', (
      SELECT jsonb_build_object('id', p.id, 'title', p.title, 'text_ru', p.text_ru, 'text_kz', p.text_kz)
      FROM public.passages p WHERE p.id = q.passage_id
    )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.question_public_json(public.questions) FROM anon, authenticated, public;

-- ────────────────────────────────────────────────────────────────────
-- 5. Подсчёт варианта: общий код для обычного теста и полного ЕНТ
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.score_variant(p_variant_id BIGINT, p_answers JSONB)
RETURNS TABLE (score INTEGER, total INTEGER, clean JSONB, answer_key JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(public.score_answer(q, p_answers -> q.id::text)), 0)::INTEGER,
    COALESCE(SUM(q.score), 0)::INTEGER,
    COALESCE(jsonb_object_agg(q.id::text, public.clean_answer(q, p_answers -> q.id::text))
             FILTER (WHERE public.clean_answer(q, p_answers -> q.id::text) IS NOT NULL), '{}'::jsonb),
    COALESCE(jsonb_object_agg(q.id::text, public.question_key_json(q)), '{}'::jsonb)
  FROM public.questions q
  WHERE q.variant_id = p_variant_id
$$;

REVOKE EXECUTE ON FUNCTION public.score_variant(BIGINT, JSONB) FROM anon, authenticated, public;

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
  v_scored RECORD;
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

  SELECT * INTO v_scored FROM public.score_variant(p_variant_id, v_answers);

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
  VALUES (uid, p_variant_id, v_scored.score, v_scored.total, v_scored.clean, v_attempt.id, v_ranked, v_duration)
  RETURNING * INTO v_row;

  IF v_attempt.id IS NOT NULL THEN
    UPDATE public.test_attempts
    SET status = 'submitted', submitted_at = NOW()
    WHERE id = v_attempt.id;
  END IF;

  RETURN jsonb_build_object('result', to_jsonb(v_row), 'answer_key', v_scored.answer_key);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 6. Разбор попытки и вопрос для объяснения — с ключом любого типа
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
             'correct_key', q.correct_key,
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
           'correct_key', q.correct_key,
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
-- 7. Темы и ошибки: вопрос считается решённым только при полном балле
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
           (COUNT(*) FILTER (WHERE public.score_answer(q, fr.answers -> q.id::text) = q.score))::bigint AS cor
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
           fr.answers -> q.id::text AS my_answer, fr.taken_at
    FROM first_results fr
    JOIN public.questions q ON q.variant_id = fr.variant_id
    JOIN public.variants v ON v.id = q.variant_id
    JOIN public.subjects s ON s.id = v.subject_id
    WHERE fr.answers IS NOT NULL
      AND public.score_answer(q, fr.answers -> q.id::text) < q.score
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
                  'correct_key', q.correct_key,
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

-- Ответ в тренировке теперь JSONB (любой тип вопроса); ошибка исправлена при полном балле.
-- Ответ: {"is_correct": bool, "score": N, "correct_answer": <ключ>}
DROP FUNCTION IF EXISTS public.record_mistake_practice(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.record_mistake_practice(p_question_id BIGINT, p_answer JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  q public.questions;
  v_answer JSONB;
  v_score INTEGER;
  v_ok BOOLEAN;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_user_blocked(me) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;

  SELECT qq.* INTO q
  FROM public.questions qq
  WHERE qq.id = p_question_id
    AND EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.student_id = me AND r.variant_id = qq.variant_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Вопрос недоступен';
  END IF;

  v_answer := public.clean_answer(q, p_answer);
  IF v_answer IS NULL THEN
    RAISE EXCEPTION 'Недопустимый ответ';
  END IF;

  v_score := public.score_answer(q, v_answer);
  v_ok := (v_score = q.score);

  INSERT INTO public.mistake_practice (student_id, question_id, last_correct)
  VALUES (me, p_question_id, v_ok)
  ON CONFLICT (student_id, question_id) DO UPDATE
  SET last_correct = EXCLUDED.last_correct,
      attempts = public.mistake_practice.attempts + 1,
      updated_at = NOW();

  RETURN jsonb_build_object('is_correct', v_ok, 'score', v_score, 'correct_answer', public.question_key_json(q));
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 8. Полный ЕНТ: одна попытка из нескольких предметов
--    Обязательные предметы — история Казахстана, математическая грамотность,
--    грамотность чтения (берутся те, по которым есть варианты с вопросами)
--    + два профильных на выбор ученика.
-- ────────────────────────────────────────────────────────────────────
INSERT INTO public.subjects (name) VALUES ('math_literacy'), ('reading_literacy')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'expired')),
  -- [{"subject_id":1,"subject":"math","variant_id":5,"required":false}] в порядке показа
  sections JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  score INTEGER,
  total_score INTEGER
);

-- У ученика не больше одного открытого полного теста
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_one_open
  ON public.exam_sessions(student_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student
  ON public.exam_sessions(student_id, started_at DESC);

ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_exam_sessions" ON public.exam_sessions;
CREATE POLICY "select_own_exam_sessions" ON public.exam_sessions FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS exam_session_id BIGINT REFERENCES public.exam_sessions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.full_exam_required_subjects()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['kazakhstan_history', 'math_literacy', 'reading_literacy']
$$;

-- Что доступно для полного теста: предметы, по которым есть варианты с вопросами.
-- Ответ: [{"subject_id","subject","required","variants"}]
CREATE OR REPLACE FUNCTION public.get_full_exam_options()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'subject_id', x.id,
             'subject', x.name,
             'required', x.name = ANY(public.full_exam_required_subjects()),
             'variants', x.cnt
           ) ORDER BY x.name)
    FROM (
      SELECT s.id, s.name,
             (SELECT COUNT(*) FROM public.variants v
              WHERE v.subject_id = s.id
                AND EXISTS (SELECT 1 FROM public.questions q WHERE q.variant_id = v.id))::INTEGER AS cnt
      FROM public.subjects s
    ) x
    WHERE x.cnt > 0
  ), '[]'::jsonb);
END;
$$;

-- Попытка вместе с вопросами по разделам (без ключей)
CREATE OR REPLACE FUNCTION public.full_exam_payload(p_session public.exam_sessions)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'session', to_jsonb(p_session),
    'server_now', NOW(),
    'sections', COALESCE((
      SELECT jsonb_agg(
               sec.value || jsonb_build_object(
                 'variant_name', v.variant_name,
                 'variant_number', v.variant_number,
                 'questions', COALESCE((
                   SELECT jsonb_agg(public.question_public_json(q) ORDER BY q.order_num, q.id)
                   FROM public.questions q WHERE q.variant_id = v.id
                 ), '[]'::jsonb)
               ) ORDER BY sec.ordinality)
      FROM jsonb_array_elements(p_session.sections) WITH ORDINALITY sec(value, ordinality)
      JOIN public.variants v ON v.id = (sec.value ->> 'variant_id')::BIGINT
    ), '[]'::jsonb)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.full_exam_payload(public.exam_sessions) FROM anon, authenticated, public;

-- Старт полного теста. Незавершённая попытка с неистёкшим временем продолжается
-- (выбранные предметы тогда не учитываются).
-- Время: 2 минуты на вопрос, но не больше 240 минут — как на ЕНТ (120 вопросов / 240 минут).
CREATE OR REPLACE FUNCTION public.start_full_exam(p_profile_subject_ids BIGINT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_session public.exam_sessions;
  v_sections JSONB := '[]'::jsonb;
  v_subject RECORD;
  v_variant_id BIGINT;
  v_questions INTEGER := 0;
  v_count INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_user_blocked(uid) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;

  UPDATE public.exam_sessions
  SET status = 'expired'
  WHERE student_id = uid AND status = 'open' AND expires_at <= NOW();

  SELECT * INTO v_session
  FROM public.exam_sessions
  WHERE student_id = uid AND status = 'open';
  IF FOUND THEN
    RETURN public.full_exam_payload(v_session);
  END IF;

  IF p_profile_subject_ids IS NULL
     OR (SELECT COUNT(DISTINCT x) FROM unnest(p_profile_subject_ids) x) <> 2
     OR array_length(p_profile_subject_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'Выберите два профильных предмета';
  END IF;
  IF (SELECT COUNT(*) FROM public.subjects s WHERE s.id = ANY(p_profile_subject_ids)) <> 2 THEN
    RAISE EXCEPTION 'Предмет не найден';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.subjects s
    WHERE s.id = ANY(p_profile_subject_ids) AND s.name = ANY(public.full_exam_required_subjects())
  ) THEN
    RAISE EXCEPTION 'Обязательный предмет нельзя выбрать профильным';
  END IF;

  -- сначала обязательные (в порядке ЕНТ), затем профильные в порядке выбора
  FOR v_subject IN
    SELECT s.id, s.name, TRUE AS required, r.ord AS ord
    FROM unnest(public.full_exam_required_subjects()) WITH ORDINALITY r(name, ord)
    JOIN public.subjects s ON s.name = r.name
    UNION ALL
    SELECT s.id, s.name, FALSE, 100 + p.ord
    FROM unnest(p_profile_subject_ids) WITH ORDINALITY p(id, ord)
    JOIN public.subjects s ON s.id = p.id
    ORDER BY ord
  LOOP
    -- вариант, который ученик ещё не сдавал, если такой есть; иначе любой
    SELECT v.id, (SELECT COUNT(*) FROM public.questions q WHERE q.variant_id = v.id)::INTEGER
    INTO v_variant_id, v_count
    FROM public.variants v
    WHERE v.subject_id = v_subject.id
      AND EXISTS (SELECT 1 FROM public.questions q WHERE q.variant_id = v.id)
    ORDER BY EXISTS (SELECT 1 FROM public.results r WHERE r.student_id = uid AND r.variant_id = v.id),
             random()
    LIMIT 1;

    IF v_variant_id IS NULL THEN
      IF v_subject.required THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'По выбранному предмету пока нет вариантов';
    END IF;

    v_sections := v_sections || jsonb_build_object(
      'subject_id', v_subject.id,
      'subject', v_subject.name,
      'variant_id', v_variant_id,
      'required', v_subject.required
    );
    v_questions := v_questions + v_count;
    v_variant_id := NULL;
  END LOOP;

  IF jsonb_array_length(v_sections) < 2 THEN
    RAISE EXCEPTION 'Выберите два профильных предмета';
  END IF;

  BEGIN
    INSERT INTO public.exam_sessions (student_id, sections, expires_at)
    VALUES (uid, v_sections, NOW() + make_interval(secs => LEAST(v_questions * 120, 240 * 60)))
    RETURNING * INTO v_session;
  EXCEPTION WHEN unique_violation THEN
    -- параллельный запрос из второй вкладки уже создал попытку
    SELECT * INTO v_session
    FROM public.exam_sessions
    WHERE student_id = uid AND status = 'open';
  END;

  RETURN public.full_exam_payload(v_session);
END;
$$;

-- Сдача полного теста: по каждому разделу создаётся строка results.
-- В рейтинг раздел идёт, если тест сдан вовремя и этот вариант ученик раньше не сдавал.
-- Ответ: {"session": ..., "results": [<строки results>], "answer_key": {"<question_id>": <ключ>}}
CREATE OR REPLACE FUNCTION public.submit_full_exam(p_session_id BIGINT, p_answers JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_answers JSONB := COALESCE(p_answers, '{}'::jsonb);
  v_session public.exam_sessions;
  v_section JSONB;
  v_variant_id BIGINT;
  v_scored RECORD;
  v_on_time BOOLEAN;
  v_duration INTEGER;
  v_row public.results;
  v_rows JSONB := '[]'::jsonb;
  v_key JSONB := '{}'::jsonb;
  v_score INTEGER := 0;
  v_total INTEGER := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_user_blocked(uid) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;
  IF jsonb_typeof(v_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers must be a JSON object';
  END IF;

  SELECT * INTO v_session
  FROM public.exam_sessions
  WHERE id = p_session_id AND student_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Тест не найден';
  END IF;
  IF v_session.status = 'submitted' THEN
    RAISE EXCEPTION 'Тест уже сдан';
  END IF;

  v_on_time := NOW() <= v_session.expires_at + INTERVAL '30 seconds';
  v_duration := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_session.started_at))::INTEGER);

  FOR v_section IN SELECT value FROM jsonb_array_elements(v_session.sections)
  LOOP
    v_variant_id := (v_section ->> 'variant_id')::BIGINT;
    -- вариант могли удалить, пока шёл тест
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.variants WHERE id = v_variant_id);

    SELECT * INTO v_scored FROM public.score_variant(v_variant_id, v_answers);

    INSERT INTO public.results (
      student_id, variant_id, score, total_score, answers, is_ranked, duration_seconds, exam_session_id
    ) VALUES (
      uid, v_variant_id, v_scored.score, v_scored.total, v_scored.clean,
      v_on_time AND NOT EXISTS (SELECT 1 FROM public.results r WHERE r.student_id = uid AND r.variant_id = v_variant_id),
      v_duration, v_session.id
    )
    RETURNING * INTO v_row;

    v_rows := v_rows || to_jsonb(v_row);
    v_key := v_key || v_scored.answer_key;
    v_score := v_score + v_scored.score;
    v_total := v_total + v_scored.total;
  END LOOP;

  UPDATE public.exam_sessions
  SET status = 'submitted', submitted_at = NOW(), score = v_score, total_score = v_total
  WHERE id = v_session.id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object('session', to_jsonb(v_session), 'results', v_rows, 'answer_key', v_key);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 9. Права доступа
-- ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.submit_test_result(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_result_review(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_for_explain(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_topic_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_mistakes(BIGINT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_mistake_practice(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_full_exam_options() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_full_exam(BIGINT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_full_exam(BIGINT, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_mistake_practice(BIGINT, JSONB) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_full_exam_options() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.start_full_exam(BIGINT[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_full_exam(BIGINT, JSONB) FROM anon, public;
