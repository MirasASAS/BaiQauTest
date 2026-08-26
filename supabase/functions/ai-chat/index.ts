// BaiQAU AI Chat — Gemini прокси (Edge Function)
// Клиенттік API ключін жасырады + рейт-лимит + қауіпсіздік.
// Deploy: supabase functions deploy ai-chat
// Secrets: supabase secrets set GEMINI_API_KEY=...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders, jsonResponse, handleCors } from '../_shared/cors.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
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

interface RequestBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  language: 'kz' | 'ru';
  systemPrompt: string;
  temperature?: number;
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
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

    // 4. Деректерді өңдеу
    const body: RequestBody = await req.json();
    if (!body.systemPrompt || !body.messages) {
      return jsonResponse({ error: 'Missing systemPrompt or messages' }, 400);
    }

    const geminiMessages: GeminiMessage[] = [
      { role: 'user', parts: [{ text: body.systemPrompt }] },
      { role: 'model', parts: [{ text: body.language === 'kz' ? 'Түсіндім!' : 'Понял!' }] },
    ];
    for (const msg of body.messages) {
      geminiMessages.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
    }

    const temperature = body.temperature ?? 0.7;

    // 5. Модельдерді кезекпен сынау (клиенттегідей fallback)
    let lastError: string | null = null;
    for (const model of MODELS) {
      try {
        const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: geminiMessages,
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

        // 6. Қолдануды журналға жазу
        await supabase.from('ai_usage').insert({ user_id: user.id, model, tokens: -1 }).catch(() => {});

        return jsonResponse({ text });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
    }

    return jsonResponse({ error: lastError || 'All AI models failed' }, 502);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});