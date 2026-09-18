// scripts/migrate-jsonl-to-db.ts
//
// One-off migration: copies existing entries from data/assessments.jsonl into
// the Assessment table. Run once after DATABASE_URL/DIRECT_URL are set and
// `npx prisma migrate deploy` has created the schema:
//
//   npx ts-node scripts/migrate-jsonl-to-db.ts
//
// Safe to skip if you don't need the pre-existing JSONL history.

import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

const LOG_FILE = path.join(process.cwd(), 'data', 'assessments.jsonl');

async function main() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log(`No JSONL log found at ${LOG_FILE} - nothing to migrate.`);
    return;
  }

  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  const lines = content
    .trim()
    .split('\n')
    .filter(line => line.trim());

  let migrated = 0;
  let skipped = 0;

  for (const line of lines) {
    let record: any;
    try {
      record = JSON.parse(line);
    } catch (e) {
      console.error('Skipping malformed JSONL line:', e);
      skipped++;
      continue;
    }

    try {
      await prisma.assessment.upsert({
        where: { id: record.id },
        create: {
          id: record.id,
          timestamp: new Date(record.timestamp),
          systemName: record.systemName,
          description: record.description,
          classification: record.classification,
          confidenceScore: record.confidenceScore,
          evidenceStrength: record.evidenceStrength,
          violations: record.violations ?? [],
          highRiskMatches: record.highRiskMatches ?? [],
          applicableArticles: record.applicableArticles ?? [],
          obligations: record.obligations ?? [],
          riskScore: record.riskScore ?? null,
          reasoning: record.reasoning ?? '',
          rulesVersion: record.rulesVersion ?? 'unknown',
          metadata: record.metadata ?? {},
        },
        update: {},
      });
      migrated++;
    } catch (e) {
      console.error(`Failed to migrate record ${record?.id}:`, e);
      skipped++;
    }
  }

  console.log(`Migrated ${migrated} record(s), skipped ${skipped}.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
