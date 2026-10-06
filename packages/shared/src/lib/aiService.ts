import type { Language } from '../i18n/translations';
import { supabase } from '../supabase';

// Все обращения к ИИ идут через Edge Functions (ai-chat / ai-import):
// ключи провайдеров лежат в секретах Supabase и в браузер не попадают.

async function invokeAI(fn: 'ai-chat' | 'ai-import', body: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message || `AI function ${fn} failed`);
  if (!data?.text) throw new Error(data?.error || 'Empty AI response');
  return data.text;
}

// Gemini для админских задач (Edge Function ai-import, только админ)
export async function callGemini(systemPrompt: string, userPrompt: string, temperature = 0.3, maxTokens = 4096): Promise<string> {
  return invokeAI('ai-import', { provider: 'gemini', systemPrompt, userPrompt, temperature, maxTokens });
}

// Системные промпты ученических запросов собирает сервер (ai-chat) — клиент шлёт только данные.
export async function chatWithAI(
  messages: { role: 'user' | 'assistant'; content: string }[],
  language: Language
): Promise<string> {
  return invokeAI('ai-chat', { kind: 'chat', messages, language });
}

// Объяснение вопроса: сервер сам берёт вопрос и ключ из БД и кэширует ответ.
// Доступно только после сдачи варианта, к которому относится вопрос.
export async function explainQuestion(questionId: number, language: Language): Promise<string> {
  return invokeAI('ai-chat', { kind: 'explain', questionId, language });
}

export async function getStudyRecommendation(
  stats: { testsCompleted: number; averageScore: number; bestResult: number },
  language: Language
): Promise<string> {
  if (stats.testsCompleted === 0) {
    return language === 'kz'
      ? '📚 Сіз әлі тест тапсырған жоқсыз. Бірінші тестіңізді тапсырып, күшті және әлсіз жақтарыңызды анықтаңыз!'
      : '📚 Вы ещё не проходили тесты. Пройдите свой первый тест, чтобы определить сильные и слабые стороны!';
  }
  return invokeAI('ai-chat', { kind: 'recommendation', stats, language });
}

// Темы для вопросов, у которых тема не задана (админ, Edge Function ai-import).
// knownTopics — темы, уже принятые в этом предмете: ИИ просят по возможности брать их,
// чтобы один и тот же раздел не получил несколько разных названий.
// Ответ: {id вопроса → тема}; вопросы, по которым ИИ ничего не вернул, в ответ не попадают.
export async function suggestQuestionTopics(
  subjectName: string,
  questions: { id: number; question_text: string }[],
  knownTopics: string[],
): Promise<Record<number, string>> {
  if (questions.length === 0) return {};
  const list = questions.map(q => `${q.id}: ${q.question_text.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
  const known = knownTopics.length ? `\nУже используемые темы (бери их, если вопрос подходит):\n- ${knownTopics.slice(0, 60).join('\n- ')}\n` : '';
  const prompt = `Предмет ЕНТ: ${subjectName}.
Определи тему каждого тестового вопроса: 2–4 слова, название раздела школьной программы, на языке вопроса.
${known}
Вопросы в формате «id: текст»:
${list}

Ответ — ТОЛЬКО JSON-массив без другого текста: [{"id": 12, "topic": "Квадратные уравнения"}]`;

  const response = await callGemini('Ты методист, который размечает тестовые вопросы ЕНТ по темам.', prompt, 0.2, 4096);

  let jsonStr = response.trim();
  const fenced = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) jsonStr = fenced[1].trim();
  if (!jsonStr.startsWith('[')) {
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) jsonStr = arrayMatch[0];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('AI generated invalid format');
  }
  if (!Array.isArray(parsed)) throw new Error('AI generated invalid format');

  const allowed = new Set(questions.map(q => q.id));
  const result: Record<number, string> = {};
  for (const item of parsed as { id?: unknown; topic?: unknown }[]) {
    const id = Number(item?.id);
    const topic = typeof item?.topic === 'string' ? item.topic.trim().slice(0, 80) : '';
    if (allowed.has(id) && topic) result[id] = topic;
  }
  return result;
}

export interface GeneratedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  topic?: string | null;
}

export async function generateTestQuestions(
  subjectName: string,
  questionCount: number,
  language: Language
): Promise<GeneratedQuestion[]> {
  const prompt = language === 'kz'
    ? `Сен ҰБТ тест сұрақтарын құрастыратын сарапшысың.

Пән: ${subjectName}
Сұрақ саны: ${questionCount}

Әрбір сұрақ ҰБТ деңгейіне сай болуы керек. Әр сұрақтың 4 нұсқасы (A, B, C, D) болуы тиіс, тек бір дұрыс жауап болуы керек.

МАҢЫЗДЫ: Жауабыңды МІНДЕТТІ түрде тек JSON массиві ретінде бер, басқа ешқандай мәтін болмасын. Формат:
[
  {
    "question_text": "Сұрақ мәтіні",
    "option_a": "A нұсқасы",
    "option_b": "B нұсқасы",
    "option_c": "C нұсқасы",
    "option_d": "D нұсқасы",
    "correct_answer": "A",
    "topic": "Сұрақтың тақырыбы (2-4 сөз)"
  }
]

Сұрақтар әр түрлі тақырыптарды қамтуы керек. Дұрыс жауаптар A, B, C, D арасында біркелкі бөлінсін.
ТЕК JSON массиві, басқа мәтін жоқ!`
    : `Ты эксперт по составлению тестовых вопросов для ЕНТ (Единое Национальное Тестирование, Казахстан).

Предмет: ${subjectName}
Количество вопросов: ${questionCount}

Каждый вопрос должен соответствовать уровню ЕНТ. У каждого вопроса 4 варианта ответа (A, B, C, D), только один правильный.

ВАЖНО: Ответ должен быть ТОЛЬКО JSON массивом, без какого-либо другого текста. Формат:
[
  {
    "question_text": "Текст вопроса",
    "option_a": "Вариант A",
    "option_b": "Вариант B",
    "option_c": "Вариант C",
    "option_d": "Вариант D",
    "correct_answer": "A",
    "topic": "Тема вопроса (2-4 слова)"
  }
]

Вопросы должны охватывать разные темы предмета. Правильные ответы должны быть равномерно распределены между A, B, C, D.
ТОЛЬКО JSON массив, никакого другого текста!`;

  // Генерация вопросов — админская операция, идёт через ai-import
  const response = await callGemini(
    language === 'kz' ? 'Сен ҰБТ тест сұрақтарын құрастыратын сарапшысың.' : 'Ты эксперт по составлению тестовых вопросов для ЕНТ.',
    prompt,
    0.7,
    8192,
  );

  // Parse JSON from response — handle various response formats
  let jsonStr = response.trim();
  
  // Remove markdown code block if present
  if (jsonStr.includes('```')) {
    const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      jsonStr = match[1].trim();
    } else {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
  }
  
  // Try to extract JSON array if there's extra text around it
  if (!jsonStr.startsWith('[')) {
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonStr) as GeneratedQuestion[];

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    // Validate and clean each question
    const validQuestions: GeneratedQuestion[] = parsed
      .filter(q =>
        q.question_text && q.option_a && q.option_b && q.option_c && q.option_d && 
        ['A', 'B', 'C', 'D'].includes(q.correct_answer?.toUpperCase() ?? '')
      )
      .map(q => ({
        question_text: String(q.question_text).trim(),
        option_a: String(q.option_a).trim(),
        option_b: String(q.option_b).trim(),
        option_c: String(q.option_c).trim(),
        option_d: String(q.option_d).trim(),
        correct_answer: q.correct_answer.toUpperCase() as 'A' | 'B' | 'C' | 'D',
        topic: typeof q.topic === 'string' && q.topic.trim() ? q.topic.trim().slice(0, 80) : null,
      }));

    if (validQuestions.length === 0) {
      throw new Error('No valid questions in response');
    }

    return validQuestions;
  } catch (parseErr) {
    console.error('Failed to parse AI response:', parseErr);
    throw new Error('AI generated invalid format');
  }
}
