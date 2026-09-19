// pages/api/systems/[id]/checklist/[itemId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { CHECKLIST_STATUSES, ChecklistStatus } from '@/lib/classification-engine';
import { ChecklistPatch, updateChecklistItem } from '@/lib/checklist';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed. Use PATCH.' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id, itemId } = req.query;
  if (typeof id !== 'string' || typeof itemId !== 'string') {
    return res.status(400).json({ error: 'Invalid system or item id' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body is required' });
  }

  const patch: ChecklistPatch = {};

  if (body.status !== undefined) {
    if (!CHECKLIST_STATUSES.includes(body.status)) {
      return res
        .status(400)
        .json({ error: `status must be one of: ${CHECKLIST_STATUSES.join(', ')}` });
    }
    patch.status = body.status as ChecklistStatus;
  }

  if (body.owner !== undefined) {
    if (body.owner !== null && (typeof body.owner !== 'string' || !body.owner.trim())) {
      return res.status(400).json({ error: 'owner must be a non-empty string or null' });
    }
    patch.owner = body.owner === null ? null : body.owner.trim();
  }

  if (body.evidenceLink !== undefined) {
    if (
      body.evidenceLink !== null &&
      (typeof body.evidenceLink !== 'string' || !isHttpUrl(body.evidenceLink))
    ) {
      return res.status(400).json({ error: 'evidenceLink must be an http(s) URL or null' });
    }
    patch.evidenceLink = body.evidenceLink;
  }

  if (Object.keys(patch).length === 0) {
    return res
      .status(400)
      .json({ error: 'Provide at least one of: status, owner, evidenceLink' });
  }

  try {
    const item = await updateChecklistItem(id, itemId, patch, user.id);
    if (!item) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }
    return res.status(200).json({ success: true, item });
  } catch (error) {
    console.error('Checklist update error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
