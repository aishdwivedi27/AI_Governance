// pages/api/intake/clarify.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { getWizardRules } from '@/lib/classification-engine';
import { LLMConfigError, LLMMessage, LLMRequestError, isLLMConfigured } from '@/lib/llm';
import { getContradictionSignals, getQuestion, sanitizeAnswers } from '@/lib/assessment-flow';
import {
  ClarifyMode,
  MAX_MESSAGE_LENGTH,
  MAX_USER_TURNS,
  clarifyQuestion,
} from '@/lib/intake-clarify';
import { updateLLMExchangeForActor } from '@/lib/qa-sessions';

function parseHistory(raw: unknown): LLMMessage[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_USER_TURNS * 2) return null;
  const out: LLMMessage[] = [];
  for (const m of raw) {
    if (
      !m ||
      (m.role !== 'user' && m.role !== 'assistant') ||
      typeof m.content !== 'string' ||
      m.content.length > MAX_MESSAGE_LENGTH * 2
    ) {
      return null;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { mode, questionId, userMessage, sessionId, answers } = req.body ?? {};

  if (mode !== 'clarify' && mode !== 'challenge') {
    return res.status(400).json({ error: 'mode must be "clarify" or "challenge"' });
  }
  if (typeof questionId !== 'string') {
    return res.status(400).json({ error: 'questionId is required' });
  }
  if (userMessage !== undefined && (typeof userMessage !== 'string' || userMessage.length > MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({ error: `userMessage must be a string of at most ${MAX_MESSAGE_LENGTH} characters` });
  }
  if (sessionId !== undefined && typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId must be a string' });
  }
  const history = parseHistory(req.body?.history);
  if (!history) {
    return res.status(400).json({ error: 'history is invalid or too long' });
  }

  const rules = getWizardRules();
  const question = getQuestion(questionId, rules);
  if (!question) {
    return res.status(400).json({ error: 'Unknown questionId' });
  }

  // The opening call (empty message) doesn't count as one of the user's turns
  const userTurns =
    history.filter(m => m.role === 'user').length + (typeof userMessage === 'string' && userMessage.trim() ? 1 : 0);
  if (userTurns > MAX_USER_TURNS) {
    return res.status(429).json({
      error: 'Turn limit reached for this question. Choose an answer, or mark it as unsure.',
    });
  }

  if (!isLLMConfigured()) {
    return res.status(503).json({ error: 'LLM assistance is not configured' });
  }

  // Signals are always recomputed here from the submitted answers; a client-supplied
  // "signals" field is ignored so the model can only be shown deterministic evidence.
  const currentAnswers = sanitizeAnswers(answers);
  const signals = mode === 'challenge' ? getContradictionSignals(questionId, currentAnswers, rules) : [];
  if (mode === 'challenge' && signals.length === 0) {
    return res.status(400).json({ error: 'No contradicting evidence to discuss for this answer' });
  }

  try {
    const result = await clarifyQuestion({
      mode: mode as ClarifyMode,
      question,
      systemContext: {
        systemName: currentAnswers.systemName,
        description: currentAnswers.description,
        productType: currentAnswers.productType,
        primaryFunction: currentAnswers.primaryFunction,
      },
      signals,
      history,
      userMessage: typeof userMessage === 'string' ? userMessage : '',
    });

    if (sessionId) {
      await updateLLMExchangeForActor(sessionId, user.id, current => {
        const clarifications = { ...(current.clarifications ?? {}) };
        clarifications[questionId] = [
          ...(clarifications[questionId] ?? []),
          ...(typeof userMessage === 'string' && userMessage.trim() ? [{ role: 'user', mode, content: userMessage }] : []),
          {
            role: 'assistant',
            mode,
            content: result.reply,
            proposedAnswer: result.proposedAnswer,
            assessment: result.assessment,
            at: new Date().toISOString(),
          },
        ];
        return { ...current, clarifications };
      });
    }

    return res.status(200).json({
      reply: result.reply,
      proposedAnswer: result.proposedAnswer,
      assessment: result.assessment,
      turnsRemaining: MAX_USER_TURNS - userTurns,
    });
  } catch (error) {
    if (error instanceof LLMConfigError) {
      return res.status(503).json({ error: 'LLM assistance is not configured' });
    }
    console.error('Intake clarify error:', error instanceof LLMRequestError ? error.message : error);
    return res.status(502).json({ error: 'The AI assistant is unavailable right now' });
  }
}
