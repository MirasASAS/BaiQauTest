-- Add subjects data
INSERT INTO subjects (name) VALUES
('math'),
('informatics'),
('kazakhstan_history'),
('world_history'),
('physics'),
('chemistry'),
('biology'),
('geography'),
('english');

-- Add variant_name column to variants
ALTER TABLE variants ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- Update questions table to have separate option columns instead of jsonb
-- First add the columns
ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_a TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_b TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_c TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_d TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS order_num INTEGER DEFAULT 1;

-- Drop the old options column if exists
ALTER TABLE questions DROP COLUMN IF EXISTS options;

-- Update results table
ALTER TABLE results ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0;

-- Add policies for results table
DROP POLICY IF EXISTS select_own_results ON results;
DROP POLICY IF EXISTS insert_own_results ON results;
CREATE POLICY "select_own_results" ON results FOR SELECT
  TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "insert_own_results" ON results FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id);

-- Add policies for variants (all authenticated can read, admins can write)
DROP POLICY IF EXISTS select_variants ON variants;
DROP POLICY IF EXISTS insert_variants ON variants;
DROP POLICY IF EXISTS update_variants ON variants;
DROP POLICY IF EXISTS delete_variants ON variants;
CREATE POLICY "select_variants" ON variants FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_variants" ON variants FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "update_variants" ON variants FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "delete_variants" ON variants FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Add policies for subjects (all authenticated can read)
DROP POLICY IF EXISTS select_subjects ON subjects;
CREATE POLICY "select_subjects" ON subjects FOR SELECT
  TO authenticated USING (true);