-- ═══════════════════════════════════════════════════════════════════
-- AI USAGE TABLE (для рейт-лимита Edge Functions)
-- Вставьте весь файл в SQL Editor Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL DEFAULT '',
  tokens INTEGER NOT NULL DEFAULT -1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON public.ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage(created_at);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Сервер (Edge Function) өз функциясы арқылы жазады, RLS рұқсат керек
DROP POLICY IF EXISTS "server_write_ai_usage" ON public.ai_usage;
CREATE POLICY "server_write_ai_usage" ON public.ai_usage FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_ai_usage" ON public.ai_usage;
CREATE POLICY "read_own_ai_usage" ON public.ai_usage FOR SELECT
  TO authenticated USING (auth.uid() = user_id);