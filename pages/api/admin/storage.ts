// pages/api/admin/storage.ts
// Seed-user-only: database usage against the free-tier capacity, plus the record list (oldest first).
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSeedUser } from '@/lib/auth';
import { getStorageUsage, listRecords } from '@/lib/storage-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }
  const actor = await requireSeedUser(req, res);
  if (!actor) return;

  try {
    const [usage, list] = await Promise.all([getStorageUsage(), listRecords()]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ usage, ...list });
  } catch (error) {
    console.error('Storage usage error:', error);
    return res.status(500).json({ error: 'Could not read database usage' });
  }
}
