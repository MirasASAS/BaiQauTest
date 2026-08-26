-- ═══════════════════════════════════════════════════════════════════
-- АДМИН-ПАНЕЛЬ + GAMIFICATION (users, stats, leaderboard, streak, badges)
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Новые колонки профиля
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nickname text;

-- ────────────────────────────────────────────────────────────────────
-- 2. RLS: админ читает/меняет все профили и читает все результаты
--    ВАЖНО: проверка админа вынесена в SECURITY DEFINER-функцию is_admin(),
--    иначе политика на profiles, запрашивающая profiles, даёт бесконечную
--    рекурсию RLS (ошибка 500 у всех запросов профиля).
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "admin_read_profiles" ON public.profiles;
CREATE POLICY "admin_read_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_update_profiles" ON public.profiles;
CREATE POLICY "admin_update_profiles" ON public.profiles FOR UPDATE
  TO authenticated USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_read_results" ON public.results;
CREATE POLICY "admin_read_results" ON public.results FOR SELECT
  TO authenticated USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────
-- 3. Админ: список пользователей (с email и числом тестов)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  is_blocked boolean,
  created_at timestamptz,
  tests_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT
    p.id::uuid,
    p.first_name::text,
    p.last_name::text,
    u.email::text,
    p.role::text,
    COALESCE(p.is_blocked, false)::boolean,
    p.created_at::timestamptz,
    (SELECT COUNT(*) FROM public.results r WHERE r.student_id = p.id)::bigint
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 4. Админ: смена роли / блокировка пользователя
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user uuid, p_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.profiles SET role = p_role, updated_at = NOW() WHERE id = p_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_block(p_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.profiles
  SET is_blocked = NOT COALESCE(is_blocked, false), updated_at = NOW()
  WHERE id = p_user;
END;
$$;

-- Примечание: «блокировка» хранит флаг. Чтобы реально запретить вход —
-- нужно проверять is_blocked в приложении (например, при авторизации
-- показывать «Аккаунт заблокирован») или в триггере auth на входе.

-- ────────────────────────────────────────────────────────────────────
-- 5. Админ: статистика платформы
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS TABLE (
  total_users bigint,
  total_tests bigint,
  total_questions bigint,
  total_variants bigint,
  top_subject text,
  avg_score numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.profiles),
    (SELECT COUNT(*) FROM public.results),
    (SELECT COUNT(*) FROM public.questions),
    (SELECT COUNT(*) FROM public.variants),
    (SELECT s.name
       FROM public.variants v
       JOIN public.subjects s ON s.id = v.subject_id
       JOIN public.results r ON r.variant_id = v.id
      GROUP BY s.name
      ORDER BY COUNT(*) DESC
      LIMIT 1),
    (SELECT ROUND(AVG(r.score::numeric / NULLIF(r.total_score, 0)) * 100)
       FROM public.results r
      WHERE r.total_score > 0);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 6. Лидерборд (топ-10) и место пользователя
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  nickname text,
  tests_count bigint,
  avg_percent numeric,
  best_percent numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(
      NULLIF(p.nickname, ''),
      TRIM(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
      'Аноним'
    ) AS nickname,
    COUNT(r.id)::bigint AS tests_count,
    ROUND(AVG(r.score::numeric / NULLIF(r.total_score, 0)) * 100) AS avg_percent,
    MAX(ROUND(r.score::numeric / NULLIF(r.total_score, 0) * 100)) AS best_percent
  FROM public.results r
  JOIN public.profiles p ON p.id = r.student_id
  WHERE r.total_score > 0
  GROUP BY p.id, p.nickname, p.last_name, p.first_name
  ORDER BY avg_percent DESC
  LIMIT 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_rank()
RETURNS TABLE (
  rank bigint,
  nickname text,
  avg_percent numeric,
  tests_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT
      p.id AS user_id,
      COALESCE(
        NULLIF(p.nickname, ''),
        TRIM(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
        'Аноним'
      ) AS nickname,
      COUNT(r.id)::bigint AS tests_count,
      ROUND(AVG(r.score::numeric / NULLIF(r.total_score, 0)) * 100) AS avg_percent,
      ROW_NUMBER() OVER (ORDER BY AVG(r.score::numeric / NULLIF(r.total_score, 0)) DESC)::bigint AS rank
    FROM public.results r
    JOIN public.profiles p ON p.id = r.student_id
    WHERE r.total_score > 0
    GROUP BY p.id, p.nickname, p.last_name, p.first_name
  )
  SELECT ranked.rank, ranked.nickname, ranked.avg_percent, ranked.tests_count
  FROM ranked
  WHERE ranked.user_id = uid;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 7. Streak (дней подряд) и бейджи
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_streak(p_user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := COALESCE(p_user, auth.uid());
  streak integer := 0;
  d date := CURRENT_DATE;
  has_today boolean;
  day_exists boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Если сегодня тестов нет — серия считается с вчерашнего дня
  SELECT EXISTS (
    SELECT 1 FROM public.results WHERE student_id = uid AND taken_at::date = CURRENT_DATE
  ) INTO has_today;

  IF NOT has_today THEN
    d := d - 1;
  END IF;

  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.results WHERE student_id = uid AND taken_at::date = d
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  badges text[] := '{}'::text[];
  n_tests bigint;
  has_90 boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COUNT(*) INTO n_tests FROM public.results WHERE student_id = uid;

  SELECT EXISTS (
    SELECT 1 FROM public.results
    WHERE student_id = uid AND total_score > 0 AND (score::numeric / total_score) >= 0.9
  ) INTO has_90;

  IF n_tests >= 1  THEN badges := array_append(badges, 'first_test');      END IF;
  IF n_tests >= 10 THEN badges := array_append(badges, 'ten_tests');       END IF;
  IF n_tests >= 25 THEN badges := array_append(badges, 'twenty_five_tests'); END IF;
  IF has_90         THEN badges := array_append(badges, 'high_score');     END IF;

  RETURN badges;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 8. Права доступа
-- ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rank() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_streak(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_block(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_rank() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_streak(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_badges() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_block(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_platform_stats() FROM anon;
