-- ═══════════════════════════════════════════════════════════════════
-- ПОЛНАЯ СХЕМА ДЛЯ НОВОГО SUPABASE-ПРОЕКТА (baiQAUTestapp)
-- Вставьте весь файл целиком в SQL Editor нового проекта и нажмите RUN
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  middle_name TEXT,
  phone TEXT,
  email TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')),
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;

CREATE POLICY "select_own_profile" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Автосоздание профиля при регистрации (приложение ждёт этот триггер)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, '', '')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Первый зарегистрировавшийся пользователь становится админом
CREATE OR REPLACE FUNCTION public.make_first_user_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS make_first_user_admin_trigger ON public.profiles;
CREATE TRIGGER make_first_user_admin_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.make_first_user_admin();

-- Автоподтверждение email (без письма подтверждения)
CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = NEW.id AND email_confirmed_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_auto_confirm
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_user_email();

UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- ────────────────────────────────────────────────────────────────────
-- 2. SUBJECTS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_subjects" ON public.subjects;
DROP POLICY IF EXISTS "admin_write_subjects" ON public.subjects;

CREATE POLICY "select_subjects" ON public.subjects FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "admin_write_subjects" ON public.subjects FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

INSERT INTO public.subjects (name) VALUES
  ('math'), ('informatics'), ('kazakhstan_history'), ('world_history'),
  ('physics'), ('chemistry'), ('biology'), ('geography'), ('english')
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- 3. VARIANTS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  variant_number INTEGER NOT NULL,
  variant_name TEXT,
  total_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_variants" ON public.variants;
DROP POLICY IF EXISTS "admin_write_variants" ON public.variants;

CREATE POLICY "select_variants" ON public.variants FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "admin_write_variants" ON public.variants FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Стартовые варианты (по одному на предмет), только если вариантов ещё нет
INSERT INTO public.variants (subject_id, variant_number, variant_name)
SELECT s.id, 1, '1-нұсқа'
FROM public.subjects s
WHERE NOT EXISTS (SELECT 1 FROM public.variants);

-- ────────────────────────────────────────────────────────────────────
-- 4. QUESTIONS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.questions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id BIGINT NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_answer TEXT CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
  score INTEGER NOT NULL DEFAULT 1,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_questions" ON public.questions;
DROP POLICY IF EXISTS "admin_write_questions" ON public.questions;

CREATE POLICY "select_questions" ON public.questions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "admin_write_questions" ON public.questions FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Стартовые вопросы (45 шт. из старой БД), только если вопросов ещё нет
INSERT INTO public.questions (variant_id, question_text, option_a, option_b, option_c, option_d, correct_answer, score, order_num)
SELECT v.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, 1,
       ROW_NUMBER() OVER (PARTITION BY q.subject ORDER BY q.ord)
FROM (
  SELECT * FROM (VALUES
    -- Математика
    ('math', 1, 'Чему равно значение выражения 2² + 3²?', '10', '13', '12', '25', 'B'),
    ('math', 2, 'Решите уравнение: 2x + 5 = 13', 'x = 3', 'x = 4', 'x = 5', 'x = 9', 'B'),
    ('math', 3, 'Найдите площадь прямоугольника со сторонами 4 и 7', '11', '22', '28', '56', 'C'),
    ('math', 4, 'Чему равен корень из 144?', '10', '11', '12', '14', 'C'),
    ('math', 5, 'Вычислите: 15% от 200', '20', '25', '30', '35', 'C'),
    -- Информатика
    ('informatics', 1, 'Сколько бит в одном байте?', '4', '8', '16', '32', 'B'),
    ('informatics', 2, 'Какое устройство обрабатывает данные в компьютере?', 'ОЗУ', 'Видеокарта', 'Процессор', 'Жёсткий диск', 'C'),
    ('informatics', 3, 'Что такое алгоритм?', 'Программа', 'Устройство', 'Последовательность действий', 'Язык программирования', 'C'),
    ('informatics', 4, 'Какая система счисления используется в компьютерах?', 'Десятичная', 'Двоичная', 'Восьмеричная', 'Шестнадцатеричная', 'B'),
    ('informatics', 5, 'Что такое файл?', 'Папка', 'Программа', 'Именованная область данных', 'Устройство', 'C'),
    -- История Казахстана
    ('kazakhstan_history', 1, 'В каком году Казахстан обрёл независимость?', '1989', '1990', '1991', '1992', 'C'),
    ('kazakhstan_history', 2, 'Кто был первым Президентом Казахстана?', 'К.Токаев', 'Н.Назарбаев', 'Д.Кунаев', 'Л.Брежнев', 'B'),
    ('kazakhstan_history', 3, 'Какая столица Казахстана была первой после независимости?', 'Астана', 'Алматы', 'Караганда', 'Шымкент', 'B'),
    ('kazakhstan_history', 4, 'В каком году перенесли столицу в Астану?', '1995', '1997', '1998', '2000', 'B'),
    ('kazakhstan_history', 5, 'Как называется государственный язык Казахстана?', 'Русский', 'Казахский', 'Английский', 'Тюркский', 'B'),
    -- Всемирная история
    ('world_history', 1, 'В каком году началась Вторая мировая война?', '1937', '1938', '1939', '1940', 'C'),
    ('world_history', 2, 'Кто открыл Америку?', 'Васко да Гама', 'Христофор Колумб', 'Америго Веспуччи', 'Магеллан', 'B'),
    ('world_history', 3, 'В каком году пала Римская империя?', '395 г.', '410 г.', '455 г.', '476 г.', 'D'),
    ('world_history', 4, 'Кто был первым императором Китая?', 'Цинь Шихуанди', 'Хань Уди', 'Тан Тайцзун', 'Кублай-хан', 'A'),
    ('world_history', 5, 'Какое событие произошло в 1789 году во Франции?', 'Коронация Наполеона', 'Великая французская революция', 'Столетняя война', 'Реставрация Бурбонов', 'B'),
    -- Физика
    ('physics', 1, 'Какая единица измерения силы в СИ?', 'Джоуль', 'Ньютон', 'Ватт', 'Паскаль', 'B'),
    ('physics', 2, 'Как называется сила, с которой Земля притягивает тела?', 'Трение', 'Упругость', 'Тяжесть', 'Архимедова', 'C'),
    ('physics', 3, 'Чему равно ускорение свободного падения на Земле (м/с²)?', '8,5', '9,5', '9,8', '10,2', 'C'),
    ('physics', 4, 'Какой закон описывает инерцию?', 'Закон Гука', 'Первый закон Ньютона', 'Закон Ома', 'Закон Архимеда', 'B'),
    ('physics', 5, 'Что измеряется в Ваттах?', 'Сила', 'Работа', 'Мощность', 'Давление', 'C'),
    -- Химия
    ('chemistry', 1, 'Какой символ у кислорода?', 'K', 'O', 'C', 'H', 'B'),
    ('chemistry', 2, 'Какое вещество состоит из H₂O?', 'Водород', 'Кислород', 'Вода', 'Углекислый газ', 'C'),
    ('chemistry', 3, 'Какое состояние вещества при температуре ниже точки плавления?', 'Жидкое', 'Газообразное', 'Твёрдое', 'Плазма', 'C'),
    ('chemistry', 4, 'Какой газ необходим для горения?', 'Азот', 'Углекислый газ', 'Кислород', 'Водород', 'C'),
    ('chemistry', 5, 'Сколько протонов в атоме углерода?', '4', '6', '8', '12', 'B'),
    -- Биология
    ('biology', 1, 'Какой орган является главным насосом сердца?', 'Артерия', 'Вена', 'Желудочек', 'Капилляр', 'C'),
    ('biology', 2, 'Как называется процесс фотосинтеза?', 'Дыхание', 'Питание', 'Создание органических веществ', 'Выделение', 'C'),
    ('biology', 3, 'Какая часть клетки содержит ДНК?', 'Ядро', 'Цитоплазма', 'Митохондрия', 'Рибосома', 'A'),
    ('biology', 4, 'Сколько хромосом у человека?', '23', '46', '48', '44', 'B'),
    ('biology', 5, 'Какое вещество придаёт крови красный цвет?', 'Плазма', 'Гемоглобин', 'Лейкоциты', 'Тромбоциты', 'B'),
    -- География
    ('geography', 1, 'Какая самая большая страна по площади?', 'Китай', 'США', 'Россия', 'Канада', 'C'),
    ('geography', 2, 'Какая самая длинная река в мире?', 'Амазонка', 'Нил', 'Миссисипи', 'Янцзы', 'B'),
    ('geography', 3, 'Сколько континентов на Земле?', '5', '6', '7', '8', 'B'),
    ('geography', 4, 'Столица Австралии?', 'Сидней', 'Мельбурн', 'Канберра', 'Брисбен', 'C'),
    ('geography', 5, 'Какое море является самым солёным?', 'Каспийское', 'Мёртвое', 'Средиземное', 'Красное', 'B'),
    -- Английский язык
    ('english', 1, 'Выберите правильный артикль: ___ apple', 'a', 'an', 'the', 'без артикля', 'B'),
    ('english', 2, 'Как переводится "book"?', 'Книга', 'Ручка', 'Тетрадь', 'Стол', 'A'),
    ('english', 3, 'Выберите правильную форму глагола: She ___ to school every day', 'go', 'goes', 'going', 'went', 'B'),
    ('english', 4, 'Какое слово является прилагательным?', 'run', 'beautiful', 'house', 'quickly', 'B'),
    ('english', 5, 'Выберите Past Simple от глагола "write"', 'written', 'wrote', 'writing', 'writes', 'B')
  ) AS seed(subject, ord, question_text, option_a, option_b, option_c, option_d, correct_answer)
) q
JOIN public.subjects s ON s.name = q.subject
JOIN public.variants v ON v.subject_id = s.id AND v.variant_number = 1
WHERE NOT EXISTS (SELECT 1 FROM public.questions);

-- ────────────────────────────────────────────────────────────────────
-- 5. RESULTS (обычные тесты)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_results" ON public.results;
DROP POLICY IF EXISTS "insert_own_results" ON public.results;

CREATE POLICY "select_own_results" ON public.results FOR SELECT
  TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "insert_own_results" ON public.results FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id);

CREATE INDEX IF NOT EXISTS idx_results_student_id ON public.results(student_id);
CREATE INDEX IF NOT EXISTS idx_questions_variant_id ON public.questions(variant_id);
CREATE INDEX IF NOT EXISTS idx_variants_subject_id ON public.variants(subject_id);

-- Пересчёт баллов вариантов (на случай, если сид не заполнил total_score)
UPDATE public.variants v
SET total_score = (SELECT COUNT(*) FROM public.questions q WHERE q.variant_id = v.id)
WHERE v.total_score = 0;
