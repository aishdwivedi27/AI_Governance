// lib/users.ts
//
// Thin wrapper around prisma.user.* calls, following the same pattern as
// lib/assessment-log.ts: routes and lib/auth.ts never call `prisma` directly.

import { prisma } from './prisma';

export interface UserRecord {
  id: string;
  email: string;
  isSeedUser: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toRecord(row: {
  id: string;
  email: string;
  isSeedUser: boolean;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    isSeedUser: row.isSeedUser,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findUserByEmail(
  email: string
): Promise<(UserRecord & { passwordHash: string }) | null> {
  const row = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!row) return null;
  return { ...toRecord(row), passwordHash: row.passwordHash };
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const row = await prisma.user.findUnique({ where: { id } });
  if (!row) return null;
  return toRecord(row);
}

export async function createUser(params: {
  email: string;
  passwordHash: string;
  isSeedUser?: boolean;
  createdByUserId?: string | null;
}): Promise<UserRecord> {
  const row = await prisma.user.create({
    data: {
      email: normalizeEmail(params.email),
      passwordHash: params.passwordHash,
      isSeedUser: params.isSeedUser ?? false,
      createdByUserId: params.createdByUserId ?? null,
    },
  });
  return toRecord(row);
}

export async function updateUserPassword(id: string, passwordHash: string): Promise<UserRecord> {
  const row = await prisma.user.update({ where: { id }, data: { passwordHash } });
  return toRecord(row);
}

export async function listUsers(): Promise<UserRecord[]> {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toRecord);
}

export async function deleteUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
}
