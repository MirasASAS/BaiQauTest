import type { AnswerValue, Question, QuestionType, TestQuestion } from '../types';

// Работа с ответами всех типов вопросов. Подсчёт баллов делает сервер (score_answer, SQL 12);
// scoreAnswer здесь — его зеркало для показа результата по уже полученному ключу.

export const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type AnswerLetter = (typeof ANSWER_LETTERS)[number];

type AnyQuestion = TestQuestion | Question;

export function questionType(question: Pick<AnyQuestion, 'question_type'>): QuestionType {
  return question.question_type === 'multiple' || question.question_type === 'matching' ? question.question_type : 'single';
}

// Варианты ответа вопроса: A–D всегда, E и F — только если заполнены
export function questionOptions(
  question: Pick<AnyQuestion, 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'option_e' | 'option_f'>,
): { letter: AnswerLetter; text: string }[] {
  const options: { letter: AnswerLetter; text: string }[] = [
    { letter: 'A', text: question.option_a },
    { letter: 'B', text: question.option_b },
    { letter: 'C', text: question.option_c },
    { letter: 'D', text: question.option_d },
  ];
  if (question.option_e) options.push({ letter: 'E', text: question.option_e });
  if (question.option_f) options.push({ letter: 'F', text: question.option_f });
  return options;
}

// Утверждения вопроса на соответствие на языке интерфейса
export function matchLeft(question: Pick<AnyQuestion, 'match_left'>, language: 'kz' | 'ru'): string[] {
  return (question.match_left || []).map(item => (language === 'kz' && item.kz ? item.kz : item.ru));
}

export function maxScore(question: Pick<AnyQuestion, 'score'>): number {
  return question.score ?? 1;
}

// Ключ вопроса одним значением; null — ключ ещё не пришёл с сервера
export function questionKey(question: Pick<AnyQuestion, 'question_type' | 'correct_answer' | 'correct_key'>): AnswerValue | null {
  if (questionType(question) === 'single') return question.correct_answer ?? null;
  return question.correct_key ?? null;
}

// Вопрос с ключом, присланным сервером после сдачи
export function withAnswerKey<T extends TestQuestion>(question: T, key: AnswerValue | null | undefined): T {
  if (key == null) return question;
  if (typeof key === 'string') return { ...question, correct_answer: key as Question['correct_answer'] };
  return { ...question, correct_key: key };
}

export function isAnswered(answer: AnswerValue | null | undefined): answer is AnswerValue {
  if (answer == null) return false;
  if (typeof answer === 'string') return answer !== '';
  if (Array.isArray(answer)) return answer.length > 0;
  return Object.keys(answer).length > 0;
}

export function scoreAnswer(
  question: Pick<AnyQuestion, 'question_type' | 'correct_answer' | 'correct_key' | 'score'>,
  answer: AnswerValue | null | undefined,
): number {
  const key = questionKey(question);
  const max = maxScore(question);
  if (!isAnswered(answer) || key == null) return 0;

  if (questionType(question) === 'multiple') {
    if (!Array.isArray(answer) || !Array.isArray(key)) return 0;
    const picked = new Set(answer);
    const errors = [...picked].filter(x => !key.includes(x)).length + key.filter(x => !picked.has(x)).length;
    return Math.max(0, max - errors);
  }
  if (questionType(question) === 'matching') {
    if (typeof answer !== 'object' || Array.isArray(answer) || typeof key !== 'object' || Array.isArray(key)) return 0;
    const hits = Object.keys(key).filter(k => answer[k] === key[k]).length;
    return Math.min(max, hits);
  }
  return typeof answer === 'string' && answer === key ? max : 0;
}

// Короткая запись ответа: «A», «A, C», «1–B, 2–D»
export function formatAnswer(answer: AnswerValue | null | undefined): string {
  if (!isAnswered(answer)) return '';
  if (typeof answer === 'string') return answer;
  if (Array.isArray(answer)) return [...answer].sort().join(', ');
  return Object.keys(answer).sort().map(k => `${k}–${answer[k]}`).join(', ');
}
