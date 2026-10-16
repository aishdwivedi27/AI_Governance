// lib/llm/providers.ts
// One function per provider, all using plain fetch (no SDKs) so they run on Vercel
// serverless/edge without extra dependencies.
import { LLMConfig, LLMProviderFn, LLMRequest, LLMRequestError, LLMResponse } from './types';

const DEFAULT_MAX_TOKENS = 1024;

const RETRY_DELAYS_MS = [700, 1500];

/** 503 means the provider is briefly overloaded; worth a couple of quick retries. */
function isTransient(error: unknown): boolean {
  return error instanceof LLMRequestError && error.status === 503;
}

async function postJsonOnce(
  config: LLMConfig,
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Provider error bodies can echo request content; keep only a short snippet.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new LLMRequestError(`${config.provider} request failed (${res.status}): ${detail}`, res.status);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof LLMRequestError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LLMRequestError(`${config.provider} request timed out after ${config.timeoutMs}ms`);
    }
    throw new LLMRequestError(`${config.provider} request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(
  config: LLMConfig,
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postJsonOnce(config, url, headers, body);
    } catch (error) {
      if (!isTransient(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

function result(config: LLMConfig, text: string | undefined): LLMResponse {
  if (!text) throw new LLMRequestError(`${config.provider} returned an empty response`);
  return { text, provider: config.provider, model: config.model };
}

export const callGemini: LLMProviderFn = async (config, req: LLMRequest) => {
  const data = await postJson(
    config,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
    { 'x-goog-api-key': config.apiKey },
    {
      ...(req.system && { systemInstruction: { parts: [{ text: req.system }] } }),
      contents: req.messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(req.temperature !== undefined && { temperature: req.temperature }),
        ...(req.json && { responseMimeType: 'application/json' }),
      },
    }
  );
  const parts: Array<{ text?: string }> = data?.candidates?.[0]?.content?.parts ?? [];
  return result(config, parts.map(p => p.text ?? '').join('') || undefined);
};

export const callOpenAI: LLMProviderFn = async (config, req: LLMRequest) => {
  const data = await postJson(
    config,
    'https://api.openai.com/v1/chat/completions',
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), ...req.messages],
      max_completion_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(req.temperature !== undefined && { temperature: req.temperature }),
      ...(req.json && { response_format: { type: 'json_object' } }),
    }
  );
  return result(config, data?.choices?.[0]?.message?.content);
};

// Claude 4.x models still take temperature and no effort; Claude 5.x models think adaptively,
// are steered by effort, and reject non-default temperature.
const isLegacyClaude = (model: string) => /^claude-(haiku|sonnet|opus)-4/.test(model);

// Thinking tokens count toward max_tokens, so leave room for reasoning before the answer.
const MIN_THINKING_MAX_TOKENS = 8000;

export const callAnthropic: LLMProviderFn = async (config, req: LLMRequest) => {
  // Anthropic has no JSON mode, so ask for it in the system prompt.
  const system = [req.system, req.json && 'Respond with a single valid JSON object and nothing else.']
    .filter(Boolean)
    .join('\n\n');
  const legacy = isLegacyClaude(config.model);
  const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  const data = await postJson(
    config,
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    {
      model: config.model,
      max_tokens: legacy ? maxTokens : Math.max(maxTokens, MIN_THINKING_MAX_TOKENS),
      ...(system && { system }),
      ...(legacy
        ? req.temperature !== undefined && { temperature: req.temperature }
        : { output_config: { effort: config.effort ?? 'medium' } }),
      messages: req.messages,
    }
  );
  const blocks: Array<{ type: string; text?: string }> = data?.content ?? [];
  return result(
    config,
    blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('') || undefined
  );
};
