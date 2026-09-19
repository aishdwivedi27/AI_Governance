// pages/api/auth/login.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyPassword, createSessionToken, buildSessionCookie } from '@/lib/auth';
import { findUserByEmail } from '@/lib/users';

type ResponseData = any;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    const isValid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !isValid) {
      // Deliberately identical for "no such user" and "wrong password" -
      // never reveal whether an email exists.
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createSessionToken(user.id);
    res.setHeader('Set-Cookie', buildSessionCookie(token));

    return res.status(200).json({
      success: true,
      user: { id: user.id, email: user.email, isSeedUser: user.isSeedUser },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
