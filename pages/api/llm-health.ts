// pages/api/llm-health.ts
//
// Dev-only smoke test for the configured LLM provider. With `npm run dev` running, open
// http://localhost:3000/api/llm-health to see which provider/model answered and how fast.
// Disabled in production so it can't be used to spend API credits.
import type { NextApiRequest, NextApiResponse } from 'next';
import { generateText, getLLMConfig, LLMConfigError } from '../../lib/llm';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).end();
  }

  let config;
  try {
    config = getLLMConfig();
  } catch (error) {
    if (!(error instanceof LLMConfigError)) throw error;
    return res.status(500).json({ ok: false, stage: 'config', error: (error as Error).message });
  }

  const started = Date.now();
  try {
    const reply = await generateText({
      messages: [{ role: 'user', content: 'Reply with exactly the word: pong' }],
      maxTokens: 16,
    });
    return res.status(200).json({
      ok: /pong/i.test(reply.text),
      provider: reply.provider,
      model: reply.model,
      effort: config.effort,
      latencyMs: Date.now() - started,
      reply: reply.text.trim(),
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      stage: 'request',
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - started,
      error: (error as Error).message,
    });
  }
}
