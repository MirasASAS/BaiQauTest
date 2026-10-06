// Собирает supabase/15_ent_variant_1.sql из файлов предметов в этой папке.
// Запуск: node supabase/seed/ent-variant-1/build.mjs
// Перед записью проверяет каждый предмет на соответствие структуре ЕНТ — при ошибке файл не создаётся.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, '..', '..', '15_ent_variant_1.sql');
const VARIANT_NAME = 'ҰБТ форматы — 1-нұсқа';

// Порядок разделов как на ЕНТ: обязательные, затем профильные
const SUBJECTS = [
  'kazakhstan_history', 'math_literacy', 'reading_literacy',
  'math', 'physics', 'chemistry', 'biology', 'geography', 'world_history', 'informatics', 'english',
];

// Структура раздела: сколько заданий каждого вида
const SPEC = {
  kazakhstan_history: { single: 15, context: 5, matching: 0, multiple: 0, points: 20 },
  math_literacy: { single: 10, context: 0, matching: 0, multiple: 0, points: 10 },
  reading_literacy: { single: 0, context: 10, matching: 0, multiple: 0, points: 10 },
  profile: { single: 25, context: 5, matching: 5, multiple: 5, points: 50 },
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const errors = [];

function validate(subject, data) {
  const spec = SPEC[subject] || SPEC.profile;
  const fail = (i, message) => errors.push(`${subject} #${i + 1}: ${message}`);
  const count = { single: 0, context: 0, matching: 0, multiple: 0 };
  let points = 0;
  const seen = new Set();

  data.questions.forEach((q, i) => {
    if (!q.ru?.trim()) fail(i, 'пустой текст вопроса');
    if (!q.topic?.trim()) fail(i, 'нет темы');
    if (seen.has(q.ru)) fail(i, 'вопрос повторяется');
    seen.add(q.ru);
    const size = q.type === 'multiple' ? 6 : 4;
    if (!Array.isArray(q.optsRu) || q.optsRu.length !== size) fail(i, `нужно ${size} вариантов`);
    else {
      if (q.optsRu.some(o => !String(o).trim())) fail(i, 'пустой вариант ответа');
      if (new Set(q.optsRu.map(String)).size !== size) fail(i, 'варианты ответа повторяются');
    }
    if (q.optsKz && q.optsKz.length !== size) fail(i, 'число казахских вариантов не совпадает');

    if (q.type === 'single') {
      if (!LETTERS.slice(0, 4).includes(q.key)) fail(i, `ключ ${q.key}`);
      if (q.passage) {
        if (!data.passages?.[q.passage]) fail(i, `нет текста ${q.passage}`);
        count.context++;
      } else count.single++;
      points += 1;
    } else if (q.type === 'multiple') {
      const keys = [...q.key];
      if (keys.length < 1 || keys.length > 3 || keys.some(k => !LETTERS.includes(k)) || new Set(keys).size !== keys.length) fail(i, `ключ ${q.key}`);
      count.multiple++;
      points += 2;
    } else if (q.type === 'matching') {
      if (!Array.isArray(q.left) || q.left.length !== 2) fail(i, 'нужно два утверждения');
      else {
        if (q.left.some(row => !LETTERS.slice(0, 4).includes(row[2]))) fail(i, 'ключ соответствия');
        if (q.left[0][2] === q.left[1][2]) fail(i, 'оба утверждения ведут к одному варианту');
      }
      count.matching++;
      points += 2;
    } else fail(i, `тип ${q.type}`);
  });

  for (const kind of ['single', 'context', 'matching', 'multiple']) {
    if (count[kind] !== spec[kind]) errors.push(`${subject}: ${kind} — ${count[kind]}, по структуре ${spec[kind]}`);
  }
  if (points !== spec.points) errors.push(`${subject}: баллов ${points}, по структуре ${spec.points}`);

  // Ключи заданий с одним ответом не должны скапливаться на одной букве
  const keys = data.questions.filter(q => q.type === 'single').map(q => q.key);
  for (const letter of LETTERS.slice(0, 4)) {
    const share = keys.filter(k => k === letter).length / keys.length;
    if (share > 0.4) errors.push(`${subject}: ответ ${letter} верен в ${Math.round(share * 100)}% заданий`);
  }
  return { count, points };
}

const lit = value => (value == null || value === '' ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
const json = value => (value == null ? 'NULL' : `${lit(JSON.stringify(value))}::jsonb`);

function questionRow(q, order, passageVar) {
  const ru = q.optsRu.map(String);
  const kz = q.optsKz ? q.optsKz.map(String) : [];
  const opt = (list, i) => lit(list[i]);
  const correctAnswer = q.type === 'single' ? lit(q.key) : 'NULL';
  const correctKey = q.type === 'multiple'
    ? json([...q.key].sort())
    : q.type === 'matching'
    ? json(Object.fromEntries(q.left.map((row, i) => [String(i + 1), row[2]])))
    : 'NULL';
  const matchLeft = q.type === 'matching' ? json(q.left.map(([ruText, kzText]) => ({ ru: ruText, kz: kzText ?? null }))) : 'NULL';
  return `(v_variant, ${order}, ${lit(q.type)}, ${lit(q.topic)}, ${lit(q.ru)}, ${lit(q.kz)},\n     `
    + `${[0, 1, 2, 3, 4, 5].map(i => opt(ru, i)).join(', ')},\n     `
    + `${[0, 1, 2, 3, 4, 5].map(i => opt(kz, i)).join(', ')},\n     `
    + `${correctAnswer}, ${correctKey}, ${matchLeft}, ${passageVar ?? 'NULL'})`;
}

let sql = `-- ═══════════════════════════════════════════════════════════════════
-- ПЕРВЫЙ ВАРИАНТ В ФОРМАТЕ ЕНТ ПО ВСЕМ ПРЕДМЕТАМ
--   • история Казахстана — 20 заданий (15 с одним ответом + 5 по тексту), 20 баллов
--   • математическая грамотность — 10 заданий, 10 баллов
--   • грамотность чтения — 10 заданий по двум текстам, 10 баллов
--   • профильные предметы — по 40 заданий, 50 баллов: 25 с одним ответом,
--     5 по тексту, 5 на соответствие (2 балла), 5 с несколькими ответами (2 балла)
-- Вариант каждого предмета называется «${VARIANT_NAME}»; если он уже есть, предмет пропускается,
-- поэтому скрипт безопасен для повторного запуска.
-- Файл собран автоматически из supabase/seed/ent-variant-1/ — правьте вопросы там
-- и пересобирайте: node supabase/seed/ent-variant-1/build.mjs
-- Запускать после 14_full_ent_spec.sql.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- ═══════════════════════════════════════════════════════════════════
`;

const summary = [];
for (const subject of SUBJECTS) {
  const file = path.join(DIR, `${subject}.mjs`);
  if (!fs.existsSync(file)) {
    errors.push(`${subject}: нет файла ${subject}.mjs`);
    continue;
  }
  const data = (await import(pathToFileURL(file).href)).default;
  const { count, points } = validate(subject, data);
  summary.push(`${subject.padEnd(20)} ${String(data.questions.length).padStart(3)} заданий, ${String(points).padStart(2)} баллов  (один ответ ${count.single}, текст ${count.context}, соответствие ${count.matching}, несколько ${count.multiple})`);

  const passageKeys = Object.keys(data.passages || {});
  const passageVar = key => `v_p${passageKeys.indexOf(key) + 1}`;
  sql += `
-- ── ${subject} ${'─'.repeat(Math.max(0, 62 - subject.length))}
DO $seed$
DECLARE
  v_subject BIGINT;
  v_variant BIGINT;
${passageKeys.map(key => `  ${passageVar(key)} BIGINT;`).join('\n')}
BEGIN
  SELECT id INTO v_subject FROM public.subjects WHERE name = ${lit(subject)};
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'Предмет ${subject} не найден: сначала выполните 12_question_types_and_full_ent.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM public.variants WHERE subject_id = v_subject AND variant_name = ${lit(VARIANT_NAME)}) THEN
    RETURN;
  END IF;

  INSERT INTO public.variants (subject_id, variant_number, variant_name)
  VALUES (v_subject, (SELECT COALESCE(MAX(variant_number), 0) + 1 FROM public.variants WHERE subject_id = v_subject), ${lit(VARIANT_NAME)})
  RETURNING id INTO v_variant;
${passageKeys.map(key => {
    const p = data.passages[key];
    return `
  INSERT INTO public.passages (variant_id, title, text_ru, text_kz)
  VALUES (v_variant, ${lit(p.title)}, ${lit(p.ru)}, ${lit(p.kz)})
  RETURNING id INTO ${passageVar(key)};`;
  }).join('\n')}

  INSERT INTO public.questions (
    variant_id, order_num, question_type, topic, question_text, question_text_kz,
    option_a, option_b, option_c, option_d, option_e, option_f,
    option_a_kz, option_b_kz, option_c_kz, option_d_kz, option_e_kz, option_f_kz,
    correct_answer, correct_key, match_left, passage_id
  ) VALUES
    ${data.questions.map((q, i) => questionRow(q, i + 1, q.passage ? passageVar(q.passage) : null)).join(',\n    ')};
END
$seed$;
`;
}

console.log(summary.join('\n'));
if (errors.length) {
  console.error(`\nОШИБКИ (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
fs.writeFileSync(OUT, sql);
console.log(`\nЗаписан ${path.relative(process.cwd(), OUT)} (${Math.round(sql.length / 1024)} КБ)`);
