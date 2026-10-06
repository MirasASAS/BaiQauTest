-- ═══════════════════════════════════════════════════════════════════
-- RETENTION: вход через Google / телефон, награды недели, история ИИ-чата, напоминания
--   • профиль при входе через Google или по телефону заполняется из данных аккаунта
--   • недельный рейтинг: топ-3 каждой завершённой недели сохраняется в weekly_awards,
--     победители получают значки (week_champion / week_top3)
--   • история ИИ-чата хранится в ai_chats / ai_chat_messages
--   • push-подписки и список учеников, которым пора напомнить про серию
-- Запускать после 12_question_types_and_full_ent.sql.
-- Если позже повторно запускаете 09 — после него снова запустите этот файл:
-- он переопределяет get_user_badges.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Профиль нового пользователя: имя, email и телефон берём из аккаунта.
--    При обычной регистрации метаданных нет — имя, как и раньше, дописывает приложение.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full TEXT := TRIM(COALESCE(meta ->> 'full_name', meta ->> 'name', ''));
  v_first TEXT;
  v_last TEXT;
BEGIN
  v_first := COALESCE(NULLIF(TRIM(meta ->> 'given_name'), ''), NULLIF(split_part(v_full, ' ', 1), ''), '');
  v_last := COALESCE(
    NULLIF(TRIM(meta ->> 'family_name'), ''),
    NULLIF(TRIM(substr(v_full, length(split_part(v_full, ' ', 1)) + 1)), ''),
    ''
  );

  INSERT INTO public.profiles (id, first_name, last_name, email, phone)
  VALUES (NEW.id, left(v_first, 80), left(v_last, 80), NEW.email, NULLIF(NEW.phone, ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────────────────────────
-- 2. Награды недели: топ-3 по сумме зачётных баллов за завершённую неделю (пн–вс, Алматы)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.weekly_awards (
  week_start DATE NOT NULL,
  place SMALLINT NOT NULL CHECK (place BETWEEN 1 AND 3),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_start, place)
);

CREATE INDEX IF NOT EXISTS idx_weekly_awards_student ON public.weekly_awards(student_id);
-- итоги недели считаются по диапазону дат
CREATE INDEX IF NOT EXISTS idx_results_taken_at ON public.results(taken_at);

ALTER TABLE public.weekly_awards ENABLE ROW LEVEL SECURITY;

-- Награды пишет только ensure_weekly_awards(); читать может любой вошедший
DROP POLICY IF EXISTS "select_weekly_awards" ON public.weekly_awards;
CREATE POLICY "select_weekly_awards" ON public.weekly_awards FOR SELECT
  TO authenticated USING (TRUE);

-- Подводит итоги последних четырёх завершённых недель, если они ещё не подведены.
-- Отдельного расписания не нужно: вызывается при открытии рейтинга.
CREATE OR REPLACE FUNCTION public.ensure_weekly_awards()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_this_week DATE := date_trunc('week', NOW() AT TIME ZONE 'Asia/Almaty')::date;
  v_week DATE;
BEGIN
  FOR i IN 1..4 LOOP
    v_week := v_this_week - 7 * i;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.weekly_awards WHERE week_start = v_week);

    INSERT INTO public.weekly_awards (week_start, place, student_id, points)
    SELECT v_week, x.pos, x.uid, x.pts
    FROM (
      SELECT p.id AS uid,
             SUM(r.score)::INTEGER AS pts,
             ROW_NUMBER() OVER (
               ORDER BY SUM(r.score) DESC, AVG(r.score::numeric / r.total_score) DESC, p.id
             ) AS pos
      FROM public.results r
      JOIN public.profiles p ON p.id = r.student_id
      WHERE r.is_ranked
        AND r.total_score > 0
        AND r.taken_at >= (v_week::timestamp AT TIME ZONE 'Asia/Almaty')
        AND r.taken_at < ((v_week + 7)::timestamp AT TIME ZONE 'Asia/Almaty')
        AND NOT COALESCE(p.is_blocked, false)
      GROUP BY p.id
      HAVING SUM(r.score) > 0
    ) x
    WHERE x.pos <= 3
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_weekly_awards() FROM anon, authenticated, public;

-- Победители прошлой недели (пусто, если на прошлой неделе никто не сдавал тесты)
CREATE OR REPLACE FUNCTION public.get_last_week_winners()
RETURNS TABLE (
  week_start date,
  place smallint,
  user_id uuid,
  nickname text,
  points integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week DATE := date_trunc('week', NOW() AT TIME ZONE 'Asia/Almaty')::date - 7;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM public.ensure_weekly_awards();
  RETURN QUERY
  SELECT a.week_start, a.place, a.student_id,
         COALESCE(NULLIF(p.nickname, ''),
                  NULLIF(TRIM(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')), ''),
                  'Аноним'),
         a.points
  FROM public.weekly_awards a
  JOIN public.profiles p ON p.id = a.student_id
  WHERE a.week_start = v_week
  ORDER BY a.place;
END;
$$;

-- Значки: к прежним добавляются победитель недели и призёр недели
CREATE OR REPLACE FUNCTION public.get_user_badges()
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  badges text[] := '{}'::text[];
  n_tests bigint;
  has_90 boolean;
  best_place smallint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF public.is_user_blocked(uid) THEN RETURN '{}'::text[]; END IF;

  SELECT COUNT(DISTINCT variant_id) INTO n_tests FROM public.results WHERE student_id = uid;

  SELECT EXISTS (
    SELECT 1 FROM public.results
    WHERE student_id = uid AND is_ranked AND total_score > 0
      AND (score::numeric / total_score) >= 0.9
  ) INTO has_90;

  SELECT MIN(place) INTO best_place FROM public.weekly_awards WHERE student_id = uid;

  IF n_tests >= 1   THEN badges := array_append(badges, 'first_test');       END IF;
  IF n_tests >= 10  THEN badges := array_append(badges, 'ten_tests');        END IF;
  IF n_tests >= 25  THEN badges := array_append(badges, 'twenty_five_tests'); END IF;
  IF has_90         THEN badges := array_append(badges, 'high_score');       END IF;
  IF best_place = 1 THEN badges := array_append(badges, 'week_champion');    END IF;
  IF best_place IS NOT NULL THEN badges := array_append(badges, 'week_top3'); END IF;

  RETURN badges;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 3. История ИИ-чата. Сообщения сохраняет само приложение ученика под его RLS.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_chats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES public.ai_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chats_student ON public.ai_chats(student_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_chat ON public.ai_chat_messages(chat_id, id);

ALTER TABLE public.ai_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_ai_chats" ON public.ai_chats;
CREATE POLICY "own_ai_chats" ON public.ai_chats FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid() AND NOT public.is_user_blocked(auth.uid()));

DROP POLICY IF EXISTS "select_own_ai_chat_messages" ON public.ai_chat_messages;
CREATE POLICY "select_own_ai_chat_messages" ON public.ai_chat_messages FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_chats c WHERE c.id = chat_id AND c.student_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_ai_chat_messages" ON public.ai_chat_messages;
CREATE POLICY "insert_own_ai_chat_messages" ON public.ai_chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.ai_chats c WHERE c.id = chat_id AND c.student_id = auth.uid())
    AND NOT public.is_user_blocked(auth.uid())
  );

-- Новое сообщение поднимает чат наверх списка
CREATE OR REPLACE FUNCTION public.touch_ai_chat()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_chats SET updated_at = NOW() WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_ai_chat_trigger ON public.ai_chat_messages;
CREATE TRIGGER touch_ai_chat_trigger
  AFTER INSERT ON public.ai_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_chat();

-- ────────────────────────────────────────────────────────────────────
-- 4. Push-напоминания про серию
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'kz' CHECK (lang IN ('kz', 'ru')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- день (по Алматы), когда на это устройство уже отправили напоминание
  last_reminded_on DATE
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_student ON public.push_subscriptions(student_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Подписку создаёт RPC save_push_subscription; ученик видит и удаляет только свои
DROP POLICY IF EXISTS "select_own_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "select_own_push_subscriptions" ON public.push_subscriptions FOR SELECT
  TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "delete_own_push_subscriptions" ON public.push_subscriptions FOR DELETE
  TO authenticated USING (student_id = auth.uid());

-- Одно устройство = одна подписка: при входе под другим аккаунтом она переходит к нему
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_lang TEXT DEFAULT 'kz'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://' OR char_length(p_endpoint) > 1000
     OR COALESCE(p_p256dh, '') = '' OR char_length(p_p256dh) > 200
     OR COALESCE(p_auth, '') = '' OR char_length(p_auth) > 100 THEN
    RAISE EXCEPTION 'Недопустимая подписка';
  END IF;

  INSERT INTO public.push_subscriptions (student_id, endpoint, p256dh, auth, lang)
  VALUES (uid, p_endpoint, p_p256dh, p_auth, CASE WHEN p_lang = 'ru' THEN 'ru' ELSE 'kz' END)
  ON CONFLICT (endpoint) DO UPDATE
  SET student_id = EXCLUDED.student_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      lang = EXCLUDED.lang;
END;
$$;

-- Кому напомнить сегодня: вчера (по Алматы) тест был, сегодня ещё нет, напоминание не отправляли.
-- Вызывает только Edge Function send-reminders от имени service role.
CREATE OR REPLACE FUNCTION public.get_streak_reminder_targets()
RETURNS TABLE (
  id bigint,
  endpoint text,
  p256dh text,
  auth text,
  lang text,
  streak integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today date := (NOW() AT TIME ZONE 'Asia/Almaty')::date;
BEGIN
  RETURN QUERY
  SELECT s.id, s.endpoint, s.p256dh, s.auth, s.lang, public.get_user_streak(s.student_id)
  FROM public.push_subscriptions s
  JOIN public.profiles p ON p.id = s.student_id
  WHERE NOT COALESCE(p.is_blocked, false)
    AND s.last_reminded_on IS DISTINCT FROM today
    AND EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.student_id = s.student_id AND (r.taken_at AT TIME ZONE 'Asia/Almaty')::date = today - 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.student_id = s.student_id AND (r.taken_at AT TIME ZONE 'Asia/Almaty')::date = today
    );
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 5. Права доступа
-- ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_last_week_winners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_streak_reminder_targets() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_last_week_winners() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_badges() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_streak_reminder_targets() FROM anon, authenticated, public;

-- ────────────────────────────────────────────────────────────────────
-- 6. Расписание напоминаний (необязательно, запускается отдельно).
--    Нужны расширения pg_cron и pg_net (Database → Extensions) и задеплоенная
--    функция send-reminders с секретом CRON_SECRET. Подставьте свои значения
--    и выполните блок без комментариев. 14:00 UTC = 19:00 по Алматы.
-- ────────────────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--   'streak-reminders',
--   '0 14 * * *',
--   $cron$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--     body := '{}'::jsonb
--   );
--   $cron$
-- );
