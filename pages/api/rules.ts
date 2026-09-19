// pages/api/rules.ts
// Serves the rules data the wizard needs, so the browser never imports the fs-backed engine.
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { getWizardRules } from '@/lib/classification-engine';
import { isLLMConfigured } from '@/lib/llm';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    return res.status(200).json({ rules: getWizardRules(), llmEnabled: isLLMConfigured() });
  } catch (error) {
    console.error('Rules read error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
