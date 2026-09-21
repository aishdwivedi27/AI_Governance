// pages/api/admin/purge.ts
// Seed-user-only: delete assessments (and their checklist items and audit events) by id or by date.
// Body: { ids: string[] } | { before: ISO date }, plus { dryRun: true } to count without deleting.
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSeedUser } from '@/lib/auth';
import { previewPurge, purgeRecords, type PurgeTarget } from '@/lib/storage-admin';

function parseTarget(body: any): PurgeTarget | string {
  if (Array.isArray(body?.ids)) {
    const ids = body.ids.filter((i: unknown): i is string => typeof i === 'string' && i.length > 0);
    if (ids.length === 0) return 'Select at least one record';
    return { ids };
  }
  if (typeof body?.before === 'string') {
    const before = new Date(body.before);
    if (Number.isNaN(before.getTime())) return 'Invalid date';
    if (before.getTime() > Date.now()) return 'Choose a date in the past';
    return { before };
  }
  return 'Provide ids or a before date';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  const actor = await requireSeedUser(req, res);
  if (!actor) return;

  const target = parseTarget(req.body);
  if (typeof target === 'string') return res.status(400).json({ error: target });

  try {
    if (req.body?.dryRun) {
      return res.status(200).json({ dryRun: true, counts: await previewPurge(target) });
    }
    return res.status(200).json({ dryRun: false, counts: await purgeRecords(target, actor.id) });
  } catch (error) {
    console.error('Purge error:', error);
    return res.status(500).json({ error: 'Delete failed' });
  }
}
