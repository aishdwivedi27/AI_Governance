// scripts/seed-user.ts
//
// One-time bootstrap: provisions the seed (admin) user from env vars.
// Safe to re-run - upserts by email, so re-running with a changed
// SEED_USER_PASSWORD rotates the seed user's password.
//
//   npm run seed:user
//
// Requires SEED_USER_EMAIL and SEED_USER_PASSWORD to be set (see .env.example).

import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/auth';

async function main() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_USER_EMAIL and SEED_USER_PASSWORD must both be set (see .env.example).'
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    create: { email: normalizedEmail, passwordHash, isSeedUser: true },
    update: { passwordHash, isSeedUser: true },
  });

  console.log(`Seed user ready: ${user.email} (id: ${user.id})`);
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
