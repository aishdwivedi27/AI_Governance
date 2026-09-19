// __tests__/llm.test.ts
import { generateText, getLLMConfig, isLLMConfigured, LLMConfigError, LLMRequestError } from '../lib/llm';

const realFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  for (const k of ['LLM_PROVIDER', 'LLM_MODEL', 'LLM_TIMEOUT_MS', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) {
    delete process.env[k];
  }
});

afterAll(() => {
  global.fetch = realFetch;
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '' };
}

describe('getLLMConfig', () => {
  test('defaults to Gemini', () => {
    const config = getLLMConfig({ GEMINI_API_KEY: 'k' } as any);
    expect(config).toMatchObject({ provider: 'gemini', model: 'gemini-3.6-flash', apiKey: 'k' });
  });

  test('selects provider, model and timeout from env', () => {
    const config = getLLMConfig({
      LLM_PROVIDER: 'Anthropic',
      ANTHROPIC_API_KEY: 'k',
      LLM_MODEL: 'my-model',
      LLM_TIMEOUT_MS: '5000',
    } as any);
    expect(config).toMatchObject({ provider: 'anthropic', model: 'my-model', timeoutMs: 5000 });
  });

  test('throws on unknown provider or missing key for the chosen provider', () => {
    expect(() => getLLMConfig({ LLM_PROVIDER: 'foo' } as any)).toThrow(LLMConfigError);
    expect(() => getLLMConfig({ LLM_PROVIDER: 'openai', GEMINI_API_KEY: 'k' } as any)).toThrow(/OPENAI_API_KEY/);
  });

  test('isLLMConfigured reflects whether a key exists', () => {
    expect(isLLMConfigured({} as any)).toBe(false);
    expect(isLLMConfigured({ GEMINI_API_KEY: 'k' } as any)).toBe(true);
  });
});

describe('generateText', () => {
  const request = {
    system: 'sys',
    messages: [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello' },
      { role: 'user' as const, content: 'again' },
    ],
    json: true,
  };

  test('calls Gemini by default with mapped roles, system instruction and JSON mime type', async () => {
    process.env.GEMINI_API_KEY = 'gk';
    fetchMock.mockResolvedValueOnce(ok({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }));

    const res = await generateText(request);

    expect(res).toEqual({ text: '{"a":1}', provider: 'gemini', model: 'gemini-3.6-flash' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('gk');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  test('calls OpenAI when LLM_PROVIDER=openai', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'ok';
    fetchMock.mockResolvedValueOnce(ok({ choices: [{ message: { content: 'hey' } }] }));

    const res = await generateText(request);

    expect(res).toMatchObject({ text: 'hey', provider: 'openai', model: 'gpt-4o-mini' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer ok');
    const body = JSON.parse(init.body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  test('calls Anthropic when LLM_PROVIDER=anthropic, honouring LLM_MODEL', async () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'ak';
    process.env.LLM_MODEL = 'claude-custom';
    fetchMock.mockResolvedValueOnce(ok({ content: [{ type: 'text', text: 'yo' }] }));

    const res = await generateText(request);

    expect(res).toMatchObject({ text: 'yo', provider: 'anthropic', model: 'claude-custom' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('ak');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-custom');
    expect(body.system).toContain('sys');
    expect(body.system).toContain('JSON');
  });

  test('wraps provider HTTP errors', async () => {
    process.env.GEMINI_API_KEY = 'gk';
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'quota' });
    await expect(generateText(request)).rejects.toMatchObject({
      constructor: LLMRequestError,
      status: 429,
    });
  });

  test('retries a transient 503 and succeeds', async () => {
    process.env.GEMINI_API_KEY = 'gk';
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'high demand' })
      .mockResolvedValueOnce(ok({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));

    const res = await generateText(request);
    expect(res.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('gives up after repeated 503s but does not retry other errors', async () => {
    process.env.GEMINI_API_KEY = 'gk';
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => 'high demand' });
    await expect(generateText(request)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });
    await expect(generateText(request)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 10000);

  test('rejects with a config error when the key is missing', async () => {
    await expect(generateText(request)).rejects.toBeInstanceOf(LLMConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
