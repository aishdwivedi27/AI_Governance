// pages/api/sessions/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { getQASessionForActor } from '@/lib/qa-sessions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  try {
    const session = await getQASessionForActor(id, user.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.status(200).json({ session });
  } catch (error) {
    console.error('Session read error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
