// OpenAI-совместимый клиент (DeepSeek и др.) — используется как fallback,
// когда Edge Function ai-import ещё не развёрнута.

interface OpenAICompatConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export async function callOpenAICompatible(
  config: OpenAICompatConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2,
  maxTokens = 4096,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
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
    const errorText = await response.text();
    throw new Error(`OpenAI-compatible API failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Empty response from OpenAI-compatible API');
  }
  return text;
}
