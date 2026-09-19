// pages/api/intake/suggest.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { getWizardRules } from '@/lib/classification-engine';
import { LLMConfigError, LLMRequestError, isLLMConfigured } from '@/lib/llm';
import { MAX_DESCRIPTION_LENGTH, suggestAnswers } from '@/lib/intake-suggest';
import { updateLLMExchangeForActor } from '@/lib/qa-sessions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { description, systemName, sessionId } = req.body ?? {};
  if (typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description is required' });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters` });
  }
  if (systemName !== undefined && typeof systemName !== 'string') {
    return res.status(400).json({ error: 'systemName must be a string' });
  }
  if (sessionId !== undefined && typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId must be a string' });
  }

  if (!isLLMConfigured()) {
    return res.status(503).json({ error: 'LLM assistance is not configured' });
  }

  try {
    const result = await suggestAnswers({ systemName, description, rules: getWizardRules() });

    if (sessionId) {
      await updateLLMExchangeForActor(sessionId, user.id, current => ({
        ...current,
        suggest: {
          description,
          suggestions: result.suggestions,
          provider: result.provider,
          model: result.model,
          at: new Date().toISOString(),
        },
      }));
    }

    return res.status(200).json({ suggestions: result.suggestions, provider: result.provider, model: result.model });
  } catch (error) {
    if (error instanceof LLMConfigError) {
      return res.status(503).json({ error: 'LLM assistance is not configured' });
    }
    console.error('Intake suggest error:', error instanceof LLMRequestError ? error.message : error);
    return res.status(502).json({ error: 'The AI assistant is unavailable right now' });
  }
}
