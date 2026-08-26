import type { ParsedQuestion, ProcessedQuestion, AIResponseEnvelope, AIQuestionResult, AIOptions } from './types';
import { buildClaudeUserPrompt, CLAUDE_JSON_SCHEMA, CLAUDE_SYSTEM_PROMPT } from './prompts';
import { callGemini } from '@baiqautest/shared';
import { DeepSeekAIProvider, isDeepSeekConfigured } from './deepseekProvider';

export interface AIProvider {
  name: string;
  // Обработка сырых вопросов: нормализация + определение ответа (если возможно)
  processQuestions(questions: ParsedQuestion[], opts: { sourceLanguage: string; targetLanguage: string }): Promise<ProcessedQuestion[]>;
}

// ── Mock AI Provider ───────────────────────────────────────────────────
// Работает без API-ключа. Структура данных — как у реального AI,
// перевод эмулируется копированием исходного текста (помечается needs_review).
export class MockAIProvider implements AIProvider {
  name = 'Mock';

  async processQuestions(
    questions: ParsedQuestion[],
    opts: { sourceLanguage: string; targetLanguage: string },
  ): Promise<ProcessedQuestion[]> {
    // Имитация задержки, чтобы был виден прогресс
    await new Promise(r => setTimeout(r, 120));

    return questions.map(q => {
      const srcRu = opts.sourceLanguage === 'ru';
      const needsTranslate = opts.targetLanguage !== 'none' && opts.targetLanguage !== opts.sourceLanguage;
      // В mock-режиме «перевод» — это копия (чтобы структура была видна), помечаем на проверку
      const question_ru = srcRu ? q.question : q.question;
      const question_kz = srcRu ? q.question : q.question;
      return {
        question_ru,
        question_kz,
        options_ru: { ...q.options },
        options_kz: { ...q.options },
        correct_answer: q.correct_answer,
        confidence: q.correct_answer ? 1 : 0.3,
        needs_review: needsTranslate || !q.correct_answer,
        is_duplicate: false,
        source_index: q.source_index,
      };
    });
  }
}

// ── Gemini AI Provider ────────────────────────────────────────────────
// Использует существующий в проекте ключ VITE_GEMINI_API_KEY.
// Извлекает/нормализует вопросы и переводит RU ↔ KZ, сохраняя формулы.
const GEMINI_SYSTEM_PROMPT = `You are a test-question extraction and translation engine for ЕНТ/ҰБТ.

Extract from each item:
- question
- four answer options (A, B, C, D)
- correct answer (A/B/C/D)

Translate Russian <-> Kazakh when requested.
Preserve: mathematical formulas (x²+2x+1), chemical formulas (H₂O, CO₂, NaCl), numbers, units, symbols, abbreviations.

Never invent missing information. If the correct answer cannot be determined from the source, set "correct_answer": null and "needs_review": true.
If target language is "none", put the source text into both question_ru/question_kz and options_ru/options_kz.

Return ONLY valid JSON (no markdown, no commentary) matching this schema:
{"questions":[{"question_ru":"","question_kz":"","options_ru":{"A":"","B":"","C":"","D":""},"options_kz":{"A":"","B":"","C":"","D":""},"correct_answer":"A","confidence":0.0,"needs_review":false,"source_index":1}]}`;

function extractJson(text: string): string {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

export class GeminiAIProvider implements AIProvider {
  name = 'Gemini';

  async processQuestions(
    questions: ParsedQuestion[],
    opts: { sourceLanguage: string; targetLanguage: string },
  ): Promise<ProcessedQuestion[]> {
    const userPrompt = JSON.stringify({
      source_language: opts.sourceLanguage,
      target_language: opts.targetLanguage,
      questions: questions.map(q => ({
        question: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        source_index: q.source_index,
      })),
    });

    // callGemini: Edge Function ai-import (сервердегі ключ) → тікелей Gemini (fallback)
    const text = await callGemini(GEMINI_SYSTEM_PROMPT, userPrompt, 0.2);

    const parsed = JSON.parse(extractJson(text)) as AIResponseEnvelope;

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Invalid Gemini JSON response');
    }

    return parsed.questions.map((q: AIQuestionResult) => {
      const correct = (['A', 'B', 'C', 'D'] as const).includes(q.correct_answer as 'A')
        ? (q.correct_answer as 'A' | 'B' | 'C' | 'D')
        : null;
      const opt = (obj: AIOptions | undefined): { A: string; B: string; C: string; D: string } => ({
        A: String(obj?.A || '').trim(),
        B: String(obj?.B || '').trim(),
        C: String(obj?.C || '').trim(),
        D: String(obj?.D || '').trim(),
      });
      const hasAllOpts = (o: { A: string; B: string; C: string; D: string }) => !!(o.A && o.B && o.C && o.D);
      const src = questions.find(x => x.source_index === q.source_index);
      const knownAnswer = src?.correct_answer || null;
      return {
        question_ru: String(q.question_ru || '').trim() || src?.question || '',
        question_kz: String(q.question_kz || '').trim() || src?.question || '',
        options_ru: opt(q.options_ru),
        options_kz: opt(q.options_kz),
        correct_answer: correct || knownAnswer,
        confidence: typeof q.confidence === 'number' ? q.confidence : (correct ? 1 : 0.3),
        needs_review: !!q.needs_review || !correct || !hasAllOpts(opt(q.options_ru)) || !hasAllOpts(opt(q.options_kz)),
        is_duplicate: false,
        source_index: q.source_index ?? src?.source_index ?? 0,
      };
    });
  }
}

// ── Claude AI Provider ─────────────────────────────────────────────────
// Production-архитектура: ключ живёт на сервере, браузер обращается к
// backend-эндпоинту (/api/ai/process). Пока backend не развёрнут —
// getAIProvider() вернёт Mock.
export class ClaudeAIProvider implements AIProvider {
  name = 'Claude';

  async processQuestions(
    questions: ParsedQuestion[],
    opts: { sourceLanguage: string; targetLanguage: string },
  ): Promise<ProcessedQuestion[]> {
    const response = await fetch('/api/ai/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: CLAUDE_SYSTEM_PROMPT,
        schema: CLAUDE_JSON_SCHEMA,
        user: buildClaudeUserPrompt(questions, opts.sourceLanguage, opts.targetLanguage),
      }),
    });

    if (!response.ok) {
      throw new Error('AI backend error');
    }

    const data = await response.json();
    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error('Invalid AI JSON response');
    }
    return data.questions as ProcessedQuestion[];
  }
}

// ── Fallback Provider ─────────────────────────────────────────────────
// Пробует основной провайдер; при ошибке (нет ключа/лимит) — безопасно
// переключается на Mock, чтобы импорт не терял вопросы.
export class FallbackProvider implements AIProvider {
  name: string;

  constructor(private primary: AIProvider, private fallback: AIProvider) {
    this.name = primary.name;
  }

  async processQuestions(
    questions: ParsedQuestion[],
    opts: { sourceLanguage: string; targetLanguage: string },
  ): Promise<ProcessedQuestion[]> {
    try {
      return await this.primary.processQuestions(questions, opts);
    } catch (err) {
      console.warn(`Primary AI (${this.primary.name}) failed, using fallback (${this.fallback.name}):`, err);
      return this.fallback.processQuestions(questions, opts);
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────
// Приоритет провайдеров: DeepSeek (если задан ключ) > Gemini > Mock.
// Любой сбой → FallbackProvider переключается на следующий, импорт не теряет вопросы.
export function getAIProvider(): AIProvider {
  const hasGemini = !!import.meta.env.VITE_GEMINI_API_KEY;
  const mode = import.meta.env.VITE_AI_PROVIDER || 'auto';

  // Явный выбор через VITE_AI_PROVIDER
  if (mode === 'claude') {
    try {
      return new FallbackProvider(new ClaudeAIProvider(), new MockAIProvider());
    } catch {
      return new MockAIProvider();
    }
  }
  if (mode === 'gemini') {
    return hasGemini
      ? new FallbackProvider(new GeminiAIProvider(), new MockAIProvider())
      : new MockAIProvider();
  }
  if (mode === 'mock') {
    return new MockAIProvider();
  }

  // Автоматический выбор
  if (isDeepSeekConfigured()) {
    return new FallbackProvider(new DeepSeekAIProvider(), hasGemini
      ? new FallbackProvider(new GeminiAIProvider(), new MockAIProvider())
      : new MockAIProvider());
  }
  if (hasGemini) {
    return new FallbackProvider(new GeminiAIProvider(), new MockAIProvider());
  }
  return new MockAIProvider();
}
