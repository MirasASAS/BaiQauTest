import { describe, it, expect } from 'vitest';
import { parseCsv, parseStructured, parseFreeform, parseExcel } from '../parsers';
import * as XLSX from 'xlsx';

const validCsv = `question,option_a,option_b,option_c,option_d,correct_answer
"Какой символ у кислорода?",K,O,C,H,B
"Сколько бит в байте?",4,8,16,32,B
`;

const missingColCsv = `question,option_a,option_b,option_d,correct_answer
text,A,B,D,B
`;

const invalidAnswerCsv = `question,option_a,option_b,option_c,option_d,correct_answer
"Вопрос?",A,B,C,D,X
`;

const duplicateCsv = `question,option_a,option_b,option_c,option_d,correct_answer
"Вопрос?",A,B,C,D,A
"Вопрос?",A,B,C,D,A
`;

const emptyQuestionCsv = `question,option_a,option_b,option_c,option_d,correct_answer
"",A,B,C,D,A
"Вопрос?",A,B,C,D,A
`;

describe('CSV parser', () => {
  it('parses valid CSV rows', () => {
    const rows = parseCsv(validCsv);
    expect(rows.length).toBe(3); // header + 2
    const { questions, errors } = parseStructured(rows);
    expect(questions.length).toBe(2);
    expect(errors).toHaveLength(0);
    expect(questions[0].correct_answer).toBe('B');
    expect(questions[0].options.B).toBe('O');
  });

  it('reports missing required columns', () => {
    const { questions, errors } = parseStructured(parseCsv(missingColCsv));
    expect(questions).toHaveLength(0);
    expect(errors.join()).toContain('option_c');
  });

  it('marks invalid correct answer as null', () => {
    const { questions } = parseStructured(parseCsv(invalidAnswerCsv));
    expect(questions[0].correct_answer).toBeNull();
  });

  it('detects duplicate questions', () => {
    const { questions, errors } = parseStructured(parseCsv(duplicateCsv));
    expect(questions).toHaveLength(1);
    expect(errors.some(e => e.includes('дубликат'))).toBe(true);
  });

  it('skips empty questions', () => {
    const { questions } = parseStructured(parseCsv(emptyQuestionCsv));
    expect(questions).toHaveLength(1);
  });
});

describe('Freeform parser (DOCX/PDF text)', () => {
  const text = `1. Қазақстанның астанасы қай қала?

A) Алматы
B) Астана
C) Шымкент
D) Ақтау

Жауабы: B

2) Какой символ у кислорода?
А. K
Ә. O
Б. C
В. H

Жауабы: Ә
`;

  it('extracts questions with options and answer', () => {
    const { questions } = parseFreeform(text);
    expect(questions.length).toBe(2);
    expect(questions[0].correct_answer).toBe('B');
    expect(questions[0].options.B).toBe('Астана');
    // Киргизские буквы вариантов маппятся на A-D
    expect(questions[1].correct_answer).toBe('B');
  });

  it('returns error for empty text', () => {
    const { questions, errors } = parseFreeform('');
    expect(questions).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Excel parser', () => {
  it('parses valid xlsx buffer', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'],
      ['Какой символ у кислорода?', 'K', 'O', 'C', 'H', 'B'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Q');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const { questions, errors } = parseExcel(buf);
    expect(questions).toHaveLength(1);
    expect(questions[0].correct_answer).toBe('B');
    expect(errors).toHaveLength(0);
  });

  it('reports broken buffer', () => {
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    const { questions, errors } = parseExcel(buf);
    expect(questions).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});
