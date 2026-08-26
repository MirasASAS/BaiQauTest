import type { Language } from '../i18n/translations';
import { supabase } from '../supabase';

// AI-ключ клиентте (fallback үшін) — негізгі жол: Edge Function (сервердегі ключ).
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export function isAIConfigured(): boolean {
  return true;
}

function getSystemPrompt(language: Language): string {
  if (language === 'kz') {
    return `Сен BaiQAU AI — қазақстандық оқушыларға ҰБТ-ге дайындалуға көмектесетін жасанды интеллект көмекшісі.

Сенің рөлің:
- Тест сұрақтарын түсіндіру
- Қателерді талдау және дұрыс жауаптарды түсіндіру
- Математика, физика, химия, биология, тарих, география, информатика, ағылшын тілі пәндері бойынша кеңес беру
- Оқушыларды мотивациялау

Ережелер:
- Қазақ тілінде жауап бер
- Қысқа, нақты және түсінікті жауап бер
- Мысалдар мен формулалар қолдан
- Достық тонда сөйле
- Markdown форматын қолдан (жалпы мәтін, тізімдер, **қалың**, формулалар)`;
  }

  return `Ты BaiQAU AI — ИИ-помощник для казахстанских учеников, готовящихся к ЕНТ.

Твоя роль:
- Объяснять тестовые вопросы
- Разбирать ошибки и объяснять правильные ответы
- Давать советы по предметам: математика, физика, химия, биология, история Казахстана, всемирная история, география, информатика, английский язык
- Мотивировать учеников

Правила:
- Отвечай на русском языке
- Давай короткие, чёткие и понятные ответы
- Используй примеры и формулы
- Общайся дружелюбно
- Используй Markdown (текст, списки, **жирный**, формулы)`;
}

// Тікелей Gemini шақыру (fallback: Edge Function жоқ кезде)
async function callGeminiDirect(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('API key not configured');
  }

  const geminiMessages: GeminiMessage[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'OK.' }] },
    { role: 'user', parts: [{ text: userPrompt }] },
  ];

  let lastError: Error | null = null;
  for (const model of MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: geminiMessages,
            generationConfig: { temperature, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Model ${model} failed: ${response.status}`);
        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts;
        if (!parts || parts.length === 0) throw new Error('Empty AI response - no parts');
        let text = '';
        for (const part of parts) { if (part.text && !part.thought) { text = part.text; break; } }
        if (!text) { for (const part of parts) { if (part.text) { text = part.text; break; } } }
        if (!text) throw new Error('Empty AI response - no text in parts');
        return text;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err as Error;
      continue;
    }
  }

  throw lastError || new Error('All AI models failed');
}

// Жалпы Gemini шақыру (импорт үшін; Edge Function бар болса соны қолданады)
export async function callGemini(systemPrompt: string, userPrompt: string, temperature = 0.3): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-import', {
      body: { provider: 'gemini', systemPrompt, userPrompt, temperature },
    });
    if (!error && data?.text) return data.text;
  } catch { /* Edge Function жоқ — тікелей шақыруға өтеміз */ }
  return callGeminiDirect(systemPrompt, userPrompt, temperature);
}

export async function chatWithAI(
  messages: { role: 'user' | 'assistant'; content: string }[],
  language: Language
): Promise<string> {
  // 1-жол: Edge Function (сервердегі ключ, қауіпсіз)
  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { messages, language, systemPrompt: getSystemPrompt(language) },
    });
    if (!error && data?.text) return data.text;
  } catch { /* fallthrough */ }

  // 2-жол: тікелей Gemini (клиенттегі ключ — Edge Function орнатылмаған кезеңге арналған fallback)
  if (GEMINI_API_KEY) {
    const geminiMessages: { role: 'user' | 'model'; parts: { text: string }[] }[] = [
      { role: 'user', parts: [{ text: getSystemPrompt(language) }] },
      { role: 'model', parts: [{ text: language === 'kz' ? 'Түсіндім!' : 'Понял!' }] },
    ];
    for (const msg of messages) {
      geminiMessages.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
    }
    let lastError: Error | null = null;
    for (const model of MODELS) {
      try {
        const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: geminiMessages,
            generationConfig: { temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
          }),
        });
        if (!response.ok) throw new Error(`Model ${model} failed: ${response.status}`);
        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts;
        if (!parts || parts.length === 0) throw new Error('Empty AI response');
        let text = '';
        for (const part of parts) { if (part.text && !part.thought) { text = part.text; break; } }
        if (!text) { for (const part of parts) { if (part.text) { text = part.text; break; } } }
        if (!text) throw new Error('Empty AI response');
        return text;
      } catch (err) {
        lastError = err as Error;
        continue;
      }
    }
    throw lastError || new Error('All AI models failed');
  }

  throw new Error('AI server not deployed and no API key configured');
}

export async function explainQuestion(
  questionText: string,
  options: { a: string; b: string; c: string; d: string },
  correctAnswer: string,
  userAnswer: string,
  subjectName: string,
  language: Language
): Promise<string> {
  const prompt = language === 'kz'
    ? `Оқушы тест тапсырды. Пән: ${subjectName}.

Сұрақ: ${questionText}
A) ${options.a}
B) ${options.b}  
C) ${options.c}
D) ${options.d}

Оқушының жауабы: ${userAnswer}
Дұрыс жауап: ${correctAnswer}

Неге ${correctAnswer} дұрыс жауап екенін қысқаша түсіндір. Егер оқушы қате жауап берсе, неге ол қате екенін де түсіндір.`
    : `Ученик прошёл тест. Предмет: ${subjectName}.

Вопрос: ${questionText}
A) ${options.a}
B) ${options.b}
C) ${options.c}
D) ${options.d}

Ответ ученика: ${userAnswer}
Правильный ответ: ${correctAnswer}

Кратко объясни, почему ${correctAnswer} — правильный ответ. Если ученик ответил неправильно, объясни почему его ответ неверный.`;

  return chatWithAI([{ role: 'user', content: prompt }], language);
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

  const prompt = language === 'kz'
    ? `Оқушының ҰБТ-ге дайындық статистикасы:
- Тапсырылған тесттер: ${stats.testsCompleted}
- Орташа балл: ${stats.averageScore}%
- Ең жақсы нәтиже: ${stats.bestResult}%

Осы статистиканы талдап, 2-3 сөйлеммен қысқа, мотивациялық кеңес бер. Эмодзилер қолдан.`
    : `Статистика подготовки ученика к ЕНТ:
- Пройдено тестов: ${stats.testsCompleted}
- Средний балл: ${stats.averageScore}%
- Лучший результат: ${stats.bestResult}%

Проанализируй эту статистику и дай краткий мотивирующий совет в 2-3 предложения. Используй эмодзи.`;

  return chatWithAI([{ role: 'user', content: prompt }], language);
}

export interface GeneratedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
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
    "correct_answer": "A"
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
    "correct_answer": "A"
  }
]

Вопросы должны охватывать разные темы предмета. Правильные ответы должны быть равномерно распределены между A, B, C, D.
ТОЛЬКО JSON массив, никакого другого текста!`;

  const response = await chatWithAI([{ role: 'user', content: prompt }], language);

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

  console.log('AI response (first 300 chars):', jsonStr.substring(0, 300));

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
      }));

    if (validQuestions.length === 0) {
      throw new Error('No valid questions in response');
    }

    console.log(`Successfully parsed ${validQuestions.length} questions`);
    return validQuestions;
  } catch (parseErr) {
    console.error('Failed to parse AI response:', jsonStr.substring(0, 500));
    console.error('Parse error:', parseErr);
    throw new Error('AI generated invalid format');
  }
}
