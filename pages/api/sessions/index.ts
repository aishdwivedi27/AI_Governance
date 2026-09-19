// pages/api/sessions/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { createQASession, listQASessionsForActor, updateQASessionForActor } from '@/lib/qa-sessions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const sessions = await listQASessionsForActor(user.id);
      return res.status(200).json({ sessions });
    } catch (error) {
      console.error('Session list error:', error);
      return res.status(500).json({ error: 'Request failed' });
    }
  }

  const { id, answers, currentStep, llmExchange } = req.body ?? {};

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'answers must be an object' });
  }
  if (typeof currentStep !== 'string' || !currentStep.trim()) {
    return res.status(400).json({ error: 'currentStep is required' });
  }
  if (id !== undefined && typeof id !== 'string') {
    return res.status(400).json({ error: 'id must be a string' });
  }

  try {
    const draft = { answers, currentStep, llmExchange };

    if (id === undefined) {
      const session = await createQASession(user.id, draft);
      return res.status(201).json({ success: true, session });
    }

    const session = await updateQASessionForActor(id, user.id, draft);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.status(200).json({ success: true, session });
  } catch (error) {
    console.error('Session save error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
