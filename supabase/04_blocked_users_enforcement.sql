-- ═══════════════════════════════════════════════════════════════════
-- BLOCKED USERS ENFORCEMENT
-- Блокталған пайдаланушыларға жүйе деңгейінде тыйым.
-- App-level тексеру (AuthContext) — UX қабаты; мұндағы trigger/RPC — нақты қорғаныс.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. Вспомогательная функция: заблокирован ли пользователь
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_user_blocked(p_user uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_blocked FROM public.profiles WHERE id = COALESCE(p_user, auth.uid())),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_user_blocked(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_user_blocked(uuid) FROM anon;

-- ────────────────────────────────────────────────────────────────────
-- 2. Блокировка записи результатов для заблокированных (накрутка/дубли)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_not_blocked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_user_blocked(NEW.student_id) THEN
    RAISE EXCEPTION 'Аккаунт заблокирован';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS results_blocked_check ON public.results;
CREATE TRIGGER results_blocked_check
  BEFORE INSERT OR UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.check_not_blocked();

-- ────────────────────────────────────────────────────────────────────
-- 3. Геймификация: заблокированные не попадают в лидерборд и не имеют streak/badges
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
    JOIN public.profiles p ON p.id = r.student_id
    WHERE NOT COALESCE(p.is_blocked, false)
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
  IF public.is_user_blocked(uid) THEN RETURN; END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (r.student_id, r.variant_id) r.*
    FROM public.results r
    JOIN public.profiles p ON p.id = r.student_id
    WHERE NOT COALESCE(p.is_blocked, false)
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

CREATE OR REPLACE FUNCTION public.get_user_streak(p_user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := COALESCE(p_user, auth.uid());
  streak integer := 0;
  d date := CURRENT_DATE;
  has_today boolean;
  day_exists boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF public.is_user_blocked(uid) THEN RETURN 0; END IF;

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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    WHERE student_id = uid AND total_score > 0 AND (score::numeric / total_score) >= 0.9
  ) INTO has_90;

  IF n_tests >= 1   THEN badges := array_append(badges, 'first_test');       END IF;
  IF n_tests >= 10  THEN badges := array_append(badges, 'ten_tests');        END IF;
  IF n_tests >= 25  THEN badges := array_append(badges, 'twenty_five_tests'); END IF;
  IF has_90         THEN badges := array_append(badges, 'high_score');       END IF;

  RETURN badges;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 4. Права доступа
-- ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rank() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_streak(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_rank() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_streak(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_badges() FROM anon;
