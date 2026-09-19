// pages/api/systems/[id]/checklist/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { getAssessmentById } from '@/lib/assessment-log';
import { getChecklistForAssessment } from '@/lib/checklist';

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
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return res.status(404).json({ error: 'System not found' });
    }
    const checklist = await getChecklistForAssessment(id);
    return res.status(200).json({ checklist });
  } catch (error) {
    console.error('Checklist read error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
