// lib/llm/index.ts
//
// Provider-agnostic LLM entry point for Q&A / intake assistance. The provider is chosen
// by env vars, so switching from the default (Gemini free tier) to OpenAI or Claude is a
// Vercel env-var change, not a code change:
//
//   LLM_PROVIDER = gemini | openai | anthropic   (default: gemini)
//   LLM_MODEL    = optional model override        (default per provider, below)
//   LLM_TIMEOUT_MS = optional request timeout     (default: 25000)
//   GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY  (key for the chosen provider)
//
// The LLM only assists intake/explanation; the deterministic classification engine
// remains the source of truth (see REQUIREMENTS.md 3.6).
import { callAnthropic, callGemini, callOpenAI } from './providers';
import {
  LLMConfig,
  LLMConfigError,
  LLMProviderFn,
  LLMProviderName,
  LLMRequest,
  LLMResponse,
} from './types';

export * from './types';

export const DEFAULT_PROVIDER: LLMProviderName = 'gemini';

const PROVIDERS: Record<
  LLMProviderName,
  { call: LLMProviderFn; keyEnv: string; defaultModel: string }
> = {
  // Free-tier Flash model. Google retires models for new keys (2.5-flash already 404s), so override with LLM_MODEL when this one is retired.
  gemini: { call: callGemini, keyEnv: 'GEMINI_API_KEY', defaultModel: 'gemini-3.6-flash' },
  openai: { call: callOpenAI, keyEnv: 'OPENAI_API_KEY', defaultModel: 'gpt-4o-mini' },
  anthropic: {
    call: callAnthropic,
    keyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-haiku-4-5-20251001',
  },
};

export function getLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig {
  const provider = (env.LLM_PROVIDER?.trim().toLowerCase() || DEFAULT_PROVIDER) as LLMProviderName;
  const spec = PROVIDERS[provider];
  if (!spec) {
    throw new LLMConfigError(
      `Unknown LLM_PROVIDER "${env.LLM_PROVIDER}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }

  const apiKey = env[spec.keyEnv]?.trim();
  if (!apiKey) {
    throw new LLMConfigError(`${spec.keyEnv} is not set (required for LLM_PROVIDER=${provider})`);
  }

  const timeoutMs = Number(env.LLM_TIMEOUT_MS);
  return {
    provider,
    model: env.LLM_MODEL?.trim() || spec.defaultModel,
    apiKey,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 25000,
  };
}

/** True when the configured provider has an API key, so callers can degrade gracefully. */
export function isLLMConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    getLLMConfig(env);
    return true;
  } catch {
    return false;
  }
}

export async function generateText(request: LLMRequest): Promise<LLMResponse> {
  const config = getLLMConfig();
  return PROVIDERS[config.provider].call(config, request);
}
