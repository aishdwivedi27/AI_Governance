// pages/api/auth/logout.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { buildClearSessionCookie } from '@/lib/auth';

type ResponseData = any;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  res.setHeader('Set-Cookie', buildClearSessionCookie());
  return res.status(200).json({ success: true });
}
