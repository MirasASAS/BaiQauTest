// BaiQAU AI Import — DeepSeek/Gemini прокси (импорт өңдеу)
// Клиенттік API ключтерін жасырады.
// Deploy: supabase functions deploy ai-import
// Secrets: supabase secrets set GEMINI_API_KEY=... DEEPSEEK_API_KEY=...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { corsHeaders, jsonResponse, handleCors } from '../_shared/cors.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') || '';
const DS_BASE_URL = Deno.env.get('DEEPSEEK_BASE_URL') || 'https://api.b.ai/v1';
const DS_MODEL = Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-v4-flash-vision-exp';

interface RequestBody {
  provider: 'deepseek' | 'gemini' | 'claude';
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) return jsonResponse({ error: 'No authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    // Запросы идут от имени пользователя (его JWT) — иначе RLS не отдаст profiles
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${authHeader}` } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_blocked, role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_blocked) return jsonResponse({ error: 'Account blocked' }, 403);
    if (profile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403);

    const body: RequestBody = await req.json();
    if (!body.systemPrompt || !body.userPrompt) {
      return jsonResponse({ error: 'Missing systemPrompt or userPrompt' }, 400);
    }

    const temperature = body.temperature ?? 0.2;
    const maxTokens = body.maxTokens ?? 4096;

    if (body.provider === 'deepseek') {
      if (!DEEPSEEK_API_KEY) return jsonResponse({ error: 'DeepSeek not configured' }, 503);
      const res = await fetch(`${DS_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: DS_MODEL,
          messages: [
            { role: 'system', content: body.systemPrompt },
            { role: 'user', content: body.userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return jsonResponse({ error: `DeepSeek: ${res.status} ${err}` }, 502);
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      if (!text) return jsonResponse({ error: 'Empty DeepSeek response' }, 502);
      return jsonResponse({ text });
    }

    if (body.provider === 'gemini') {
      if (!GEMINI_API_KEY) return jsonResponse({ error: 'Gemini not configured' }, 503);
      const geminiMessages = [
        { role: 'user', parts: [{ text: body.systemPrompt }] },
        { role: 'model', parts: [{ text: 'OK.' }] },
        { role: 'user', parts: [{ text: body.userPrompt }] },
      ];

      const models = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: geminiMessages,
              generationConfig: { temperature, topP: 0.95, topK: 40, maxOutputTokens: maxTokens },
            }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          const parts = data?.candidates?.[0]?.content?.parts;
          if (!parts) continue;
          let text = '';
          for (const part of parts) { if (part.text && !part.thought) { text = part.text; break; } }
          if (!text) { for (const part of parts) { if (part.text) { text = part.text; break; } } }
          if (text) return jsonResponse({ text });
        } catch { continue; }
      }
      return jsonResponse({ error: 'All Gemini models failed' }, 502);
    }

    return jsonResponse({ error: `Unsupported provider: ${body.provider}` }, 400);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});