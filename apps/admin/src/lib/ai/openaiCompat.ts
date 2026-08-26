// Универсальный OpenAI-совместимый клиент (DeepSeek, OpenRouter и др.)
export interface OpenAICompatConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export async function callOpenAICompatible(
  cfg: OpenAICompatConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2,
  maxTokens = 4096,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
    signal,
  });

  if (!response.ok) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 300); } catch { /* ignore */ }
    throw new Error(`OpenAI-compatible API error ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI-compatible API');
  return text;
}
