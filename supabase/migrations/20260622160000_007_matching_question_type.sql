-- Add question_type and matching_pairs columns to questions table
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'single' CHECK (question_type IN ('single', 'matching')),
  ADD COLUMN IF NOT EXISTS matching_pairs JSONB;

-- Make option columns nullable (matching questions don't use them)
ALTER TABLE questions
  ALTER COLUMN option_a DROP NOT NULL,
  ALTER COLUMN option_b DROP NOT NULL,
  ALTER COLUMN option_c DROP NOT NULL,
  ALTER COLUMN option_d DROP NOT NULL;

-- Backfill existing questions
UPDATE questions SET question_type = 'single' WHERE question_type IS NULL;
