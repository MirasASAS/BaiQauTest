// BaiQAU AI Chat — Gemini прокси (Edge Function)
// Клиенттік API ключін жасырады + рейт-лимит + қауіпсіздік.
// Системные промпты живут здесь: клиент присылает только данные (kind + поля),
// поэтому функцию нельзя использовать как произвольный Gemini-прокси.
//   kind: 'chat'           — { messages, language }
//   kind: 'explain'        — { questionId, language }  (ответ кэшируется в questions.explanation_*)
//   kind: 'recommendation' — { stats, language }
// Deploy: supabase functions deploy ai-chat
// Secrets: supabase secrets set GEMINI_API_KEY=...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { jsonResponse, handleCors } from '../_shared/cors.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

type Language = 'kz' | 'ru';

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface RequestBody {
  kind?: 'chat' | 'explain' | 'recommendation';
  language?: Language;
  messages?: { role: 'user' | 'assistant'; content: string }[];
  questionId?: number;
  stats?: { testsCompleted?: number; averageScore?: number; bestResult?: number };
}

const SUBJECT_LABELS: Record<string, { kz: string; ru: string }> = {
  math: { kz: 'Математика', ru: 'Математика' },
  informatics: { kz: 'Информатика', ru: 'Информатика' },
  kazakhstan_history: { kz: 'Қазақстан тарихы', ru: 'История Казахстана' },
  world_history: { kz: 'Дүниежүзі тарихы', ru: 'Всемирная история' },
  physics: { kz: 'Физика', ru: 'Физика' },
  chemistry: { kz: 'Химия', ru: 'Химия' },
  biology: { kz: 'Биология', ru: 'Биология' },
  geography: { kz: 'География', ru: 'География' },
  english: { kz: 'Ағылшын тілі', ru: 'Английский язык' },
};

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
- Markdown форматын қолдан (жалпы мәтін, тізімдер, **қалың**, формулалар)
- Тек оқу мен ҰБТ-ге дайындыққа қатысты сұрақтарға жауап бер`;
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
- Используй Markdown (текст, списки, **жирный**, формулы)
- Отвечай только на вопросы об учёбе и подготовке к ЕНТ`;
}

interface ExplainQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  question_text_kz?: string | null;
  option_a_kz?: string | null;
  option_b_kz?: string | null;
  option_c_kz?: string | null;
  option_d_kz?: string | null;
  correct_answer: string;
  subject: string;
}

function explainPrompt(source: ExplainQuestion, language: Language): string {
  const subject = SUBJECT_LABELS[source.subject]?.[language] || source.subject;
  // Для казахского объяснения берём казахский текст вопроса, если он заполнен
  const q = language === 'kz'
    ? {
        ...source,
        question_text: source.question_text_kz || source.question_text,
        option_a: source.option_a_kz || source.option_a,
        option_b: source.option_b_kz || source.option_b,
        option_c: source.option_c_kz || source.option_c,
        option_d: source.option_d_kz || source.option_d,
      }
    : source;
  if (language === 'kz') {
    return `ҰБТ тест сұрағы. Пән: ${subject}.

Сұрақ: ${q.question_text}
A) ${q.option_a}
B) ${q.option_b}
C) ${q.option_c}
D) ${q.option_d}

Дұрыс жауап: ${q.correct_answer}

Неге ${q.correct_answer} дұрыс жауап екенін қысқаша түсіндір, содан кейін қалған нұсқалардың неге қате екенін бір-бір сөйлеммен айт. Оқушыға тікелей жүгінбе — түсіндірме барлық оқушыларға көрсетіледі.`;
  }
  return `Тестовый вопрос ЕНТ. Предмет: ${subject}.

Вопрос: ${q.question_text}
A) ${q.option_a}
B) ${q.option_b}
C) ${q.option_c}
D) ${q.option_d}

Правильный ответ: ${q.correct_answer}

Кратко объясни, почему ${q.correct_answer} — правильный ответ, затем одной фразой про каждый из остальных вариантов — почему он неверный. Не обращайся к ученику лично: объяснение увидят все ученики.`;
}

interface TopicStat {
  subject: string;
  topic: string | null;
  total: number;
  correct: number;
}

// До трёх самых слабых тем ученика (минимум 3 вопроса по теме, меньше 70% верных)
function weakTopics(rows: TopicStat[], language: Language): string[] {
  return rows
    .filter(r => r.topic && Number(r.total) >= 3)
    .map(r => ({ ...r, percent: Math.round((Number(r.correct) / Number(r.total)) * 100) }))
    .filter(r => r.percent < 70)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 3)
    .map(r => `${SUBJECT_LABELS[r.subject]?.[language] || r.subject} — ${r.topic} (${r.percent}%)`);
}

function recommendationPrompt(
  stats: { testsCompleted: number; averageScore: number; bestResult: number },
  weak: string[],
  language: Language,
): string {
  if (language === 'kz') {
    return `Оқушының ҰБТ-ге дайындық статистикасы:
- Тапсырылған тесттер: ${stats.testsCompleted}
- Орташа балл: ${stats.averageScore}%
- Ең жақсы нәтиже: ${stats.bestResult}%
${weak.length ? `- Әлсіз тақырыптар (дұрыс жауап үлесі): ${weak.join('; ')}\n` : ''}
Осы статистиканы талдап, 2-3 сөйлеммен қысқа, мотивациялық кеңес бер.${weak.length ? ' Қай тақырыпты бірінші қайталау керегін нақты айт.' : ''} Эмодзилер қолдан.`;
  }
  return `Статистика подготовки ученика к ЕНТ:
- Пройдено тестов: ${stats.testsCompleted}
- Средний балл: ${stats.averageScore}%
- Лучший результат: ${stats.bestResult}%
${weak.length ? `- Слабые темы (доля верных ответов): ${weak.join('; ')}\n` : ''}
Проанализируй эту статистику и дай краткий мотивирующий совет в 2-3 предложения.${weak.length ? ' Назови конкретно, какую тему повторить первой.' : ''} Используй эмодзи.`;
}

function toNumber(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

// Модельдерді кезекпен сынау (fallback)
async function callGemini(
  systemPrompt: string,
  language: Language,
  messages: GeminiMessage[],
  temperature: number,
): Promise<{ text: string; model: string } | { error: string }> {
  const contents: GeminiMessage[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: language === 'kz' ? 'Түсіндім!' : 'Понял!' }] },
    ...messages,
  ];

  let lastError = 'All AI models failed';
  for (const model of MODELS) {
    try {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature, topP: 0.95, topK: 40, maxOutputTokens: 4096 },
        }),
      });

      if (!res.ok) {
        lastError = `Model ${model} failed: ${res.status}`;
        continue;
      }

      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts;
      if (!parts || parts.length === 0) {
        lastError = `Empty response from ${model}`;
        continue;
      }

      let text = '';
      for (const part of parts) {
        if (part.text && !part.thought) { text = part.text; break; }
      }
      if (!text) {
        for (const part of parts) { if (part.text) { text = part.text; break; } }
      }
      if (!text) {
        lastError = `No text in response from ${model}`;
        continue;
      }

      return { text, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { error: lastError };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // 1. JWT тексеру: пайдаланушы аутентификацияланған ба
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) return jsonResponse({ error: 'No authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    // Запросы идут от имени пользователя (его JWT) — иначе RLS не отдаст profiles/ai_usage
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${authHeader}` } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    // 2. Блокталған пайдаланушыны тексеру
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_blocked')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_blocked) return jsonResponse({ error: 'Account blocked' }, 403);

    // 3. Қарапайым рейт-лимит (сағатына 100 сұраныс)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', hourAgo);
    if (count && count >= 100) return jsonResponse({ error: 'Rate limit exceeded' }, 429);

    // 4. Деректерді өңдеу: промпт собирается на сервере по kind
    const body: RequestBody = await req.json();
    const language: Language = body.language === 'kz' ? 'kz' : 'ru';
    const kind = body.kind || 'chat';

    let messages: GeminiMessage[];
    let temperature = 0.7;
    let explainQuestionId: number | null = null;

    if (kind === 'explain') {
      const questionId = Number(body.questionId);
      if (!Number.isInteger(questionId) || questionId <= 0) {
        return jsonResponse({ error: 'Missing questionId' }, 400);
      }
      // RPC сам проверяет, что ученик уже сдавал вариант этого вопроса
      const { data: question, error: qError } = await supabase.rpc('get_question_for_explain', {
        p_question_id: questionId,
      });
      if (qError || !question) return jsonResponse({ error: qError?.message || 'Question unavailable' }, 403);

      const cached = language === 'kz' ? question.explanation_kz : question.explanation_ru;
      if (cached) return jsonResponse({ text: cached, cached: true });

      messages = [{ role: 'user', parts: [{ text: explainPrompt(question, language) }] }];
      temperature = 0.3;
      explainQuestionId = questionId;
    } else if (kind === 'recommendation') {
      const stats = {
        testsCompleted: toNumber(body.stats?.testsCompleted, 100000),
        averageScore: toNumber(body.stats?.averageScore, 100),
        bestResult: toNumber(body.stats?.bestResult, 100),
      };
      // Слабые темы сервер берёт из БД сам; если SQL 10 ещё не применён — совет будет общим
      const { data: topicRows } = await supabase.rpc('get_my_topic_stats');
      const weak = Array.isArray(topicRows) ? weakTopics(topicRows as TopicStat[], language) : [];
      messages = [{ role: 'user', parts: [{ text: recommendationPrompt(stats, weak, language) }] }];
    } else if (kind === 'chat') {
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return jsonResponse({ error: 'Missing messages' }, 400);
      }
      messages = body.messages.slice(-MAX_MESSAGES).map((msg): GeminiMessage => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(msg.content ?? '').slice(0, MAX_MESSAGE_CHARS) }],
      }));
    } else {
      return jsonResponse({ error: `Unsupported kind: ${kind}` }, 400);
    }

    const result = await callGemini(getSystemPrompt(language), language, messages, temperature);
    if ('error' in result) return jsonResponse({ error: result.error }, 502);

    // 5. Объяснение сохраняем в вопросе — следующий ученик получит его без запроса к ИИ.
    //    Писать в questions ученик не может, поэтому запись идёт от service role.
    if (explainQuestionId !== null) {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey);
        const column = language === 'kz' ? 'explanation_kz' : 'explanation_ru';
        const { error: saveError } = await admin
          .from('questions')
          .update({ [column]: result.text })
          .eq('id', explainQuestionId);
        if (saveError) console.error('explanation save failed:', saveError.message);
      }
    }

    // 6. Қолдануды журналға жазу
    const { error: usageError } = await supabase.from('ai_usage').insert({ user_id: user.id, model: result.model, tokens: -1 });
    if (usageError) console.error('ai_usage insert failed:', usageError.message);

    return jsonResponse({ text: result.text });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
