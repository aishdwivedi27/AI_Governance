// pages/api/systems/[id]/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { getSystemReport } from '@/lib/system-report';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid system id' });
  }

  try {
    const report = await getSystemReport(id);
    if (!report) {
      return res.status(404).json({ error: 'System not found' });
    }
    return res.status(200).json(report);
  } catch (error) {
    console.error('System read error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
