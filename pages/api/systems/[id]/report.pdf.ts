// pages/api/systems/[id]/report.pdf.ts
// Generated server-side from live database state so the checklist is always current.
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth';
import { getSystemReport } from '@/lib/system-report';
import { buildReportPdf, reportFilename } from '@/lib/report-pdf';

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

    const generatedAt = new Date();
    const pdf = await buildReportPdf(report, generatedAt);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reportFilename(report.assessment.systemName, generatedAt)}"`
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (error) {
    console.error('Report generation error:', error);
    return res.status(500).json({ error: 'Report generation failed' });
  }
}
