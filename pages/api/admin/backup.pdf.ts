// pages/api/admin/backup.pdf.ts
// Seed-user-only: one merged PDF of full reports for records before a date, so they can be
// kept offline before being purged. GET ?before=ISO_DATE
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSeedUser } from '@/lib/auth';
import { buildBackupPdf, resolveBackupIds, MAX_BACKUP_RECORDS } from '@/lib/storage-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }
  const actor = await requireSeedUser(req, res);
  if (!actor) return;

  const before = new Date(String(req.query.before ?? ''));
  if (Number.isNaN(before.getTime())) return res.status(400).json({ error: 'Invalid date' });

  try {
    const { ids, truncated } = await resolveBackupIds({ before });
    if (ids.length === 0) return res.status(404).json({ error: 'No records before that date' });

    const generatedAt = new Date();
    const pdf = await buildBackupPdf(ids, generatedAt);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="assessment-backup-${generatedAt.toISOString().slice(0, 10)}.pdf"`
    );
    res.setHeader('X-Backup-Count', String(ids.length));
    res.setHeader('X-Backup-Truncated', String(truncated));
    res.setHeader('X-Backup-Limit', String(MAX_BACKUP_RECORDS));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (error) {
    console.error('Backup error:', error);
    return res.status(500).json({ error: 'Backup generation failed' });
  }
}
