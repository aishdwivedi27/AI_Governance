// lib/llm/types.ts
export type LLMProviderName = 'gemini' | 'openai' | 'anthropic';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  system?: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask for a JSON object as output (best effort on providers without a JSON mode). */
  json?: boolean;
}

export interface LLMResponse {
  text: string;
  provider: LLMProviderName;
  model: string;
}

export interface LLMConfig {
  provider: LLMProviderName;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export class LLMConfigError extends Error {}

export class LLMRequestError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export type LLMProviderFn = (config: LLMConfig, request: LLMRequest) => Promise<LLMResponse>;
