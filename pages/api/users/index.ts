// pages/api/users/index.ts
// Seed-user-only: list users (GET) and create a new user (POST).
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSeedUser, hashPassword } from '@/lib/auth';
import { listUsers, createUser } from '@/lib/users';

type ResponseData = any;

const MIN_PASSWORD_LENGTH = 8;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
  }

  const actor = await requireSeedUser(req, res);
  if (!actor) return; // requireSeedUser already sent 401/403

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ users: await listUsers() });
    }

    // POST
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      email,
      passwordHash,
      isSeedUser: false,
      createdByUserId: actor.id,
    });

    return res.status(201).json({ success: true, user });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    console.error('Users API error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
}
