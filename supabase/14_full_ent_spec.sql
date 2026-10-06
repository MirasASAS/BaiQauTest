-- ═══════════════════════════════════════════════════════════════════
-- ПОЛНЫЙ ЕНТ ПО СТРУКТУРЕ ТЕСТИРОВАНИЯ
--   Структура ЕНТ: 120 заданий, 140 баллов, 240 минут
--     • история Казахстана — 20 заданий, 20 баллов
--     • математическая грамотность — 10 заданий, 10 баллов
--     • грамотность чтения — 10 заданий, 10 баллов
--     • два профильных предмета — по 40 заданий, по 50 баллов
--   • вариант «в формате ЕНТ» — тот, у которого число заданий и сумма баллов
--     совпадают со структурой своего предмета (variant_matches_ent_spec)
--   • полный тест собирается из вариантов в формате ЕНТ; вариант другого размера
--     берётся, только если по предмету подходящего нет
-- Запускать после 13_retention.sql. Сами варианты — в 15_ent_variant_1.sql.
-- Если позже повторно запускаете 12 — после него снова запустите этот файл:
-- он переопределяет get_full_exam_options и start_full_exam.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Структура раздела по предмету и проверка варианта
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ent_section_spec(p_subject TEXT)
RETURNS TABLE (questions INTEGER, points INTEGER)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_subject
           WHEN 'kazakhstan_history' THEN 20
           WHEN 'math_literacy' THEN 10
           WHEN 'reading_literacy' THEN 10
           ELSE 40
         END,
         CASE p_subject
           WHEN 'kazakhstan_history' THEN 20
           WHEN 'math_literacy' THEN 10
           WHEN 'reading_literacy' THEN 10
           ELSE 50
         END
$$;

CREATE OR REPLACE FUNCTION public.variant_matches_ent_spec(p_variant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (SELECT COUNT(*) FROM public.questions q WHERE q.variant_id = v.id) = spec.questions
       AND (SELECT COALESCE(SUM(q.score), 0) FROM public.questions q WHERE q.variant_id = v.id) = spec.points
    FROM public.variants v
    JOIN public.subjects s ON s.id = v.subject_id
    CROSS JOIN LATERAL public.ent_section_spec(s.name) spec
    WHERE v.id = p_variant_id
  ), FALSE)
$$;

REVOKE EXECUTE ON FUNCTION public.variant_matches_ent_spec(BIGINT) FROM anon, authenticated, public;

-- ────────────────────────────────────────────────────────────────────
-- 2. Что доступно для полного теста.
--    Ответ: [{"subject_id","subject","required","variants","ent_variants","questions","points"}]
--    ent_variants — сколько вариантов предмета собрано по структуре ЕНТ,
--    questions / points — сколько заданий и баллов в разделе по структуре.
-- ────────────────────────────────────────────────────────────────────
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
             'variants', x.cnt,
             'ent_variants', x.ent_cnt,
             'questions', spec.questions,
             'points', spec.points
           ) ORDER BY x.name)
    FROM (
      SELECT s.id, s.name,
             (SELECT COUNT(*) FROM public.variants v
              WHERE v.subject_id = s.id
                AND EXISTS (SELECT 1 FROM public.questions q WHERE q.variant_id = v.id))::INTEGER AS cnt,
             (SELECT COUNT(*) FROM public.variants v
              WHERE v.subject_id = s.id AND public.variant_matches_ent_spec(v.id))::INTEGER AS ent_cnt
      FROM public.subjects s
    ) x
    CROSS JOIN LATERAL public.ent_section_spec(x.name) spec
    WHERE x.cnt > 0
  ), '[]'::jsonb);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 3. Старт полного теста: сначала варианты в формате ЕНТ.
--    Время: 2 минуты на задание, не больше 240 минут — для 120 заданий это ровно 240 минут.
-- ────────────────────────────────────────────────────────────────────
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
  v_ent BOOLEAN;
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
    -- вариант в формате ЕНТ важнее всего; среди равных — тот, который ученик ещё не сдавал
    SELECT v.id,
           (SELECT COUNT(*) FROM public.questions q WHERE q.variant_id = v.id)::INTEGER,
           public.variant_matches_ent_spec(v.id)
    INTO v_variant_id, v_count, v_ent
    FROM public.variants v
    WHERE v.subject_id = v_subject.id
      AND EXISTS (SELECT 1 FROM public.questions q WHERE q.variant_id = v.id)
    ORDER BY public.variant_matches_ent_spec(v.id) DESC,
             EXISTS (SELECT 1 FROM public.results r WHERE r.student_id = uid AND r.variant_id = v.id),
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
      'required', v_subject.required,
      'ent_format', v_ent
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

GRANT EXECUTE ON FUNCTION public.get_full_exam_options() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_full_exam(BIGINT[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_full_exam_options() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.start_full_exam(BIGINT[]) FROM anon, public;
