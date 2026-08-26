import type { ProcessedQuestion, ValidationIssue } from './types';
import { supabase } from '@baiqautest/shared';

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Проверка одного вопроса. Возвращает список проблем (пустой = валиден)
export function validateQuestion(q: ProcessedQuestion): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ruText = (q.question_ru || '').trim();
  const kzText = (q.question_kz || '').trim();

  if (!ruText && !kzText) issues.push({ index: q.source_index, message: 'Отсутствует текст вопроса' });
  if (!ruText || ruText.length < 5) issues.push({ index: q.source_index, message: 'Вопрос (RU) слишком короткий' });

  (['A', 'B', 'C', 'D'] as const).forEach(k => {
    if (!q.options_ru[k] || q.options_ru[k].trim().length === 0) {
      issues.push({ index: q.source_index, message: `Отсутствует вариант ${k} (RU)` });
    }
    if (!q.options_kz[k] || q.options_kz[k].trim().length === 0) {
      issues.push({ index: q.source_index, message: `Отсутствует вариант ${k} (KZ)` });
    }
  });

  if (!q.correct_answer || !['A', 'B', 'C', 'D'].includes(q.correct_answer)) {
    issues.push({ index: q.source_index, message: 'Не указан правильный ответ' });
  }

  return issues;
}

// Дубликаты внутри набора
export function findInternalDuplicates(questions: ProcessedQuestion[]): Set<number> {
  const seen = new Map<string, number>();
  const dups = new Set<number>();
  questions.forEach((q, i) => {
    const key = normalizeText(q.question_ru || q.question_kz || '');
    if (seen.has(key)) {
      dups.add(seen.get(key)!);
      dups.add(i);
    } else if (key) {
      seen.set(key, i);
    }
  });
  return dups;
}

// Дубликаты с вопросами, уже существующими в БД (по варианту/предмету)
export async function findDbDuplicates(questions: ProcessedQuestion[]): Promise<Set<number>> {
  const dups = new Set<number>();
  if (questions.length === 0) return dups;

  const { data, error } = await supabase
    .from('questions')
    .select('question_text')
    .limit(10000);

  if (error || !data) return dups;

  const existing = new Set(data.map((q: { question_text: string }) => normalizeText(q.question_text || '')));

  questions.forEach((q, i) => {
    const key = normalizeText(q.question_ru || q.question_kz || '');
    if (key && existing.has(key)) dups.add(i);
  });

  return dups;
}

// Итоговая валидация набора: проставляет флаги needs_review / is_duplicate
export async function validateSet(questions: ProcessedQuestion[]): Promise<ProcessedQuestion[]> {
  const internalDups = findInternalDuplicates(questions);
  const dbDups = await findDbDuplicates(questions);

  return questions.map((q, i) => {
    const issues = validateQuestion(q);
    const isDup = internalDups.has(i) || dbDups.has(i);
    return {
      ...q,
      needs_review: q.needs_review || issues.length > 0 || isDup,
      is_duplicate: isDup,
      confidence: isDup ? Math.min(q.confidence, 0.4) : q.confidence,
    };
  });
}
