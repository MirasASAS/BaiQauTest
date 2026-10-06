// Системный промпт для Claude (используется backend-ом при вызове API).
// Ключ API НЕ хранится и не читается в браузере — только на сервере.
export const CLAUDE_SYSTEM_PROMPT = `
You are a test-question extraction and translation engine.
Your task is to process educational multiple-choice questions.

Extract:
- question
- four answer options
- correct answer
- topic: the curriculum topic of the question, 2-4 words in Russian

If requested, translate Russian to Kazakh or Kazakh to Russian.

Preserve:
- mathematical formulas
- chemical formulas
- scientific terminology
- numbers
- units
- symbols
- abbreviations

Never invent missing information.
If the correct answer cannot be determined from the source, mark it as uncertain instead of guessing.

Return ONLY valid JSON matching the provided schema.
`;

export const CLAUDE_JSON_SCHEMA = `{
  "questions": [
    {
      "question_ru": "",
      "question_kz": "",
      "options_ru": { "A": "", "B": "", "C": "", "D": "" },
      "options_kz": { "A": "", "B": "", "C": "", "D": "" },
      "correct_answer": "A",
      "topic": "",
      "confidence": 0.0,
      "needs_review": false,
      "source_index": 1
    }
  ]
}`;

export function buildClaudeUserPrompt(
  questions: { question: string; options: { A: string; B: string; C: string; D: string }; correct_answer: string | null }[],
  sourceLanguage: string,
  targetLanguage: string,
): string {
  return JSON.stringify({
    task: 'extract_and_translate',
    source_language: sourceLanguage,
    target_language: targetLanguage,
    questions,
  });
}
