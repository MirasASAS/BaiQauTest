import { describe, it, expect } from 'vitest';
// Модуль импортируется напрямую: индекс shared тянет за собой Supabase и i18n, тесту они не нужны
import { scoreAnswer, isAnswered, formatAnswer, questionKey, questionOptions, withAnswerKey, questionType } from '../../../../../packages/shared/src/lib/answers';
import type { TestQuestion } from '../../../../../packages/shared/src/types';

const base: TestQuestion = {
  id: 1,
  variant_id: 1,
  question_text: 'q',
  option_a: 'a',
  option_b: 'b',
  option_c: 'c',
  option_d: 'd',
  score: 1,
  order_num: 1,
};

const single: TestQuestion = { ...base, correct_answer: 'B' };
const multiple: TestQuestion = { ...base, question_type: 'multiple', option_e: 'e', option_f: 'f', score: 2, correct_key: ['A', 'C', 'E'] };
const matching: TestQuestion = {
  ...base,
  question_type: 'matching',
  score: 2,
  match_left: [{ ru: 'первое' }, { ru: 'второе' }],
  correct_key: { 1: 'B', 2: 'D' },
};

// Те же случаи, что проверяет SQL-функция score_answer (supabase/12): клиент и сервер должны совпадать
describe('scoreAnswer', () => {
  it('scores a single-answer question', () => {
    expect(scoreAnswer(single, 'B')).toBe(1);
    expect(scoreAnswer(single, 'A')).toBe(0);
    expect(scoreAnswer(single, null)).toBe(0);
  });

  it('gives 2 for an exact multiple answer regardless of order', () => {
    expect(scoreAnswer(multiple, ['E', 'C', 'A'])).toBe(2);
  });

  it('gives 1 for one missing or one extra option', () => {
    expect(scoreAnswer(multiple, ['A', 'C'])).toBe(1);
    expect(scoreAnswer(multiple, ['A', 'C', 'E', 'F'])).toBe(1);
  });

  it('gives 0 for two or more errors, including picking everything', () => {
    expect(scoreAnswer(multiple, ['A', 'C', 'D'])).toBe(0);
    expect(scoreAnswer(multiple, ['A', 'B', 'C', 'D', 'E', 'F'])).toBe(0);
    expect(scoreAnswer(multiple, [])).toBe(0);
  });

  it('gives 0 for an answer of the wrong shape', () => {
    expect(scoreAnswer(multiple, 'A')).toBe(0);
    expect(scoreAnswer(matching, ['B', 'D'])).toBe(0);
  });

  it('scores each matching pair separately', () => {
    expect(scoreAnswer(matching, { 1: 'B', 2: 'D' })).toBe(2);
    expect(scoreAnswer(matching, { 1: 'B', 2: 'A' })).toBe(1);
    expect(scoreAnswer(matching, { 1: 'A' })).toBe(0);
  });

  it('returns 0 while the key has not arrived from the server', () => {
    expect(scoreAnswer(base, 'B')).toBe(0);
  });
});

describe('answer helpers', () => {
  it('treats empty values as unanswered', () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered('')).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered({})).toBe(false);
    expect(isAnswered('A')).toBe(true);
    expect(isAnswered({ 1: 'B' })).toBe(true);
  });

  it('formats answers of every type', () => {
    expect(formatAnswer('A')).toBe('A');
    expect(formatAnswer(['C', 'A'])).toBe('A, C');
    expect(formatAnswer({ 2: 'D', 1: 'B' })).toBe('1–B, 2–D');
    expect(formatAnswer(null)).toBe('');
  });

  it('lists options E and F only when they are filled', () => {
    expect(questionOptions(single).map(o => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(questionOptions(multiple).map(o => o.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('applies a server key to the matching field for its type', () => {
    expect(questionKey(withAnswerKey(base, 'C'))).toBe('C');
    const keyed = withAnswerKey({ ...base, question_type: 'multiple' as const }, ['A', 'B']);
    expect(keyed.correct_key).toEqual(['A', 'B']);
    expect(questionKey(keyed)).toEqual(['A', 'B']);
  });

  it('falls back to single for questions saved before question types existed', () => {
    expect(questionType(base)).toBe('single');
  });
});
