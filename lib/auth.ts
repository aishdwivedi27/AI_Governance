// lib/auth.ts
//
// Password hashing, session-cookie signing/verification, and auth guard
// helpers for API routes and getServerSideProps. Sessions are a custom
// lightweight HttpOnly cookie (HMAC-SHA256 via Node's built-in `crypto`) -
// no external session library.

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSidePropsContext } from 'next';
import { findUserById } from './users';

const COOKIE_NAME = 'session';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 10;

export interface AuthedUser {
  id: string;
  email: string;
  isSeedUser: boolean;
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is not set.');
  }
  return secret;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
}

export function createSessionToken(userId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = Buffer.from(`${userId}.${expiresAt}`, 'utf-8').toString('base64url');
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | null | undefined): { userId: string } | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  let expectedSignature: string;
  try {
    expectedSignature = sign(payload);
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(signature, 'utf-8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf-8');
  } catch {
    return null;
  }

  const dotIndex = decoded.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const userId = decoded.slice(0, dotIndex);
  const expiresAtStr = decoded.slice(dotIndex + 1);
  const expiresAt = Number(expiresAtStr);
  if (!userId || !Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;

  return { userId };
}

export function buildSessionCookie(token: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookie(): string {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function readSessionCookie(req: { headers: { cookie?: string } }): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const name = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (name === COOKIE_NAME) return value;
  }
  return null;
}

export async function getAuthedUser(req: { headers: { cookie?: string } }): Promise<AuthedUser | null> {
  try {
    const token = readSessionCookie(req);
    const verified = verifySessionToken(token);
    if (!verified) return null;

    const user = await findUserById(verified.userId);
    if (!user) return null;

    return { id: user.id, email: user.email, isSeedUser: user.isSeedUser };
  } catch {
    return null;
  }
}

export async function requireAuth(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthedUser | null> {
  const user = await getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
}

export async function requireSeedUser(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthedUser | null> {
  const user = await requireAuth(req, res);
  if (!user) return null; // requireAuth already sent 401

  if (!user.isSeedUser) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}

export async function requireAuthSSR(
  ctx: GetServerSidePropsContext
): Promise<{ redirect: { destination: string; permanent: false } } | { props: { user: AuthedUser } }> {
  const user = await getAuthedUser(ctx.req);
  if (!user) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  return { props: { user } };
}
