import type { ParsedQuestion, ProcessedQuestion, AIResponseEnvelope, AIQuestionResult, AIOptions } from './types';
import { supabase } from '@baiqautest/shared';

// DeepSeek вызывается только через Edge Function ai-import: ключ, модель и base URL
// лежат в секретах Supabase (DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL).

const DEEPSEEK_SYSTEM_PROMPT = `You are a test-question extraction and translation engine for ЕНТ/ҰБТ.

Extract from each item:
- question
- four answer options (A, B, C, D)
- correct answer (A/B/C/D)

Translate Russian <-> Kazakh when requested.
Preserve: mathematical formulas (x²+2x+1), chemical formulas (H₂O, CO₂, NaCl), numbers, units, symbols, abbreviations.

For every question also set "topic": the curriculum topic it belongs to, 2-4 words in Russian (e.g. "Квадратные уравнения", "Законы Ньютона"). Use the same wording for questions of the same topic.

Never invent missing information. If the correct answer cannot be determined from the source, set "correct_answer": null and "needs_review": true.
If target language is "none", put the source text into both question_ru/question_kz and options_ru/options_kz.

Return ONLY valid JSON (no markdown, no commentary) matching this schema:
{"questions":[{"question_ru":"","question_kz":"","options_ru":{"A":"","B":"","C":"","D":""},"options_kz":{"A":"","B":"","C":"","D":""},"correct_answer":"A","topic":"","confidence":0.0,"needs_review":false,"source_index":1}]}`;

function extractJson(text: string): string {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

export class DeepSeekAIProvider {
  name = 'DeepSeek';

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

    const { data, error } = await supabase.functions.invoke('ai-import', {
      body: {
        provider: 'deepseek',
        systemPrompt: DEEPSEEK_SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.2,
        maxTokens: 4096,
      },
    });
    if (error) throw new Error(error.message);
    if (!data?.text) throw new Error(data?.error || 'Empty AI response');
    const text: string = data.text;

    const parsed = JSON.parse(extractJson(text)) as AIResponseEnvelope;
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Invalid DeepSeek JSON response');
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
      return {
        question_ru: String(q.question_ru || '').trim() || src?.question || '',
        question_kz: String(q.question_kz || '').trim() || src?.question || '',
        options_ru: opt(q.options_ru),
        options_kz: opt(q.options_kz),
        correct_answer: correct || src?.correct_answer || null,
        confidence: typeof q.confidence === 'number' ? q.confidence : (correct ? 1 : 0.3),
        needs_review: !!q.needs_review || !correct || !hasAllOpts(opt(q.options_ru)) || !hasAllOpts(opt(q.options_kz)),
        is_duplicate: false,
        topic: typeof q.topic === 'string' && q.topic.trim() ? q.topic.trim().slice(0, 80) : null,
        source_index: q.source_index ?? src?.source_index ?? 0,
      };
    });
  }
}
