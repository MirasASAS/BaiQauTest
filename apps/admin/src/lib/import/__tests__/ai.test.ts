import { describe, it, expect } from 'vitest';
import { MockAIProvider } from '../aiProvider';
import { validateQuestion, findInternalDuplicates, normalizeText } from '../validate';
import type { ParsedQuestion, ProcessedQuestion } from '../types';

describe('MockAIProvider', () => {
  it('produces valid ProcessedQuestion structure', async () => {
    const provider = new MockAIProvider();
    const parsed: ParsedQuestion[] = [
      {
        question: 'Какой символ у кислорода?',
        options: { A: 'K', B: 'O', C: 'C', D: 'H' },
        correct_answer: 'B',
        source_index: 1,
      },
    ];
    const out = await provider.processQuestions(parsed, { sourceLanguage: 'ru', targetLanguage: 'kz' });
    expect(out).toHaveLength(1);
    expect(out[0].question_ru).toBeTruthy();
    expect(out[0].correct_answer).toBe('B');
    expect(out[0].options_ru.B).toBe('O');
  });
});

describe('Validation', () => {
  const good: ProcessedQuestion = {
    question_ru: 'Столица Казахстана?',
    question_kz: 'Қазақстан астанасы?',
    options_ru: { A: 'Алматы', B: 'Астана', C: 'Караганда', D: 'Шымкент' },
    options_kz: { A: 'Алматы', B: 'Астана', C: 'Қарағанды', D: 'Шымкент' },
    correct_answer: 'B',
    confidence: 1,
    needs_review: false,
    is_duplicate: false,
    source_index: 1,
  };

  it('accepts a valid question', () => {
    expect(validateQuestion(good)).toHaveLength(0);
  });

  it('rejects missing correct answer', () => {
    expect(validateQuestion({ ...good, correct_answer: null })).not.toHaveLength(0);
  });

  it('rejects missing option', () => {
    expect(validateQuestion({ ...good, options_ru: { ...good.options_ru, A: '' } })).not.toHaveLength(0);
  });

  it('rejects too-short question', () => {
    expect(validateQuestion({ ...good, question_ru: 'А?' })).not.toHaveLength(0);
  });

  it('finds internal duplicates by normalized text', () => {
    const qs = [good, { ...good, question_ru: 'Столица  Казахстана? ' }];
    const dups = findInternalDuplicates(qs);
    expect(dups.has(0)).toBe(true);
    expect(dups.has(1)).toBe(true);
  });

  it('normalizes text for comparison', () => {
    expect(normalizeText('  Привет   МИР ')).toBe('привет мир');
  });
});
