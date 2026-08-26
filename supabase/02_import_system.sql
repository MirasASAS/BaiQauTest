-- ═══════════════════════════════════════════════════════════════════
-- IMPORT SYSTEM: tables + storage + RLS
-- Запустить в SQL Editor Supabase. Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. import_jobs — один импортированный файл = один job
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('xlsx', 'csv', 'docx', 'pdf')),
  file_size BIGINT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'parsing', 'processing', 'review', 'publishing', 'published', 'failed', 'needs_ocr')
  ),
  source_language TEXT NOT NULL DEFAULT 'ru',
  target_language TEXT NOT NULL DEFAULT 'kz',
  total_questions INTEGER NOT NULL DEFAULT 0,
  processed_questions INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 50,
  error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ────────────────────────────────────────────────────────────────────
-- 2. import_questions — черновики вопросов до публикации
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_questions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  question_ru TEXT,
  question_kz TEXT,
  option_a_ru TEXT,
  option_b_ru TEXT,
  option_c_ru TEXT,
  option_d_ru TEXT,
  option_a_kz TEXT,
  option_b_kz TEXT,
  option_c_kz TEXT,
  option_d_kz TEXT,
  correct_answer TEXT CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
  confidence NUMERIC DEFAULT 1,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'review', 'approved', 'published', 'rejected')
  ),
  source_index INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_questions_import_id ON public.import_questions(import_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON public.import_jobs(created_by);

-- ────────────────────────────────────────────────────────────────────
-- 3. RLS: только админ (или владелец) может читать/менять импорты
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_jobs_access" ON public.import_jobs;
CREATE POLICY "import_jobs_access" ON public.import_jobs FOR ALL
  TO authenticated USING (public.is_admin() OR created_by = auth.uid())
  WITH CHECK (public.is_admin() OR created_by = auth.uid());

DROP POLICY IF EXISTS "import_questions_access" ON public.import_questions;
CREATE POLICY "import_questions_access" ON public.import_questions FOR ALL
  TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.import_jobs j WHERE j.id = import_id AND j.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.import_jobs j WHERE j.id = import_id AND j.created_by = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- 4. Storage bucket test-imports (private)
-- ────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('test-imports', 'test-imports', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "import_files_access" ON storage.objects;
CREATE POLICY "import_files_access" ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'test-imports' AND public.is_admin())
  WITH CHECK (bucket_id = 'test-imports' AND public.is_admin());
