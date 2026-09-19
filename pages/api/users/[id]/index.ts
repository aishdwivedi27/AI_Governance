// pages/api/users/[id]/index.ts
// Seed-user-only: delete a user (testing/demo convenience). Self-delete is
// blocked so the acting seed user can never lock everyone out.
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSeedUser } from '@/lib/auth';
import { findUserById, deleteUser } from '@/lib/users';

type ResponseData = any;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed. Use DELETE.' });
  }

  const actor = await requireSeedUser(req, res);
  if (!actor) return;

  try {
    const { id } = req.query;

    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'User id is required' });
    }
    if (id === actor.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const target = await findUserById(id);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    await deleteUser(id);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
