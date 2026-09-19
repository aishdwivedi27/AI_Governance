// pages/api/users/[id]/password.ts
// Seed-user-only: reset any user's password by id, including the seed
// user's own id. No self-service password change/reset exists anywhere else.
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSeedUser, hashPassword } from '@/lib/auth';
import { findUserById, updateUserPassword } from '@/lib/users';

type ResponseData = any;

const MIN_PASSWORD_LENGTH = 8;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const actor = await requireSeedUser(req, res);
  if (!actor) return;

  try {
    const { id } = req.query;
    const { password } = req.body ?? {};

    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'User id is required' });
    }
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const target = await findUserById(id);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await hashPassword(password);
    await updateUserPassword(id, passwordHash);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
