// lib/storage-admin.ts
//
// Seed-user tooling for keeping the Supabase free-tier database (500 MB) from filling up:
// measure usage, list records, purge records by id or by date, and build a merged PDF backup.
//
// Purging deliberately deletes an assessment's checklist items and audit events too (orphaned audit
// rows would keep consuming space), then writes ONE summary audit event so the deletion itself
// is on record. lib/audit-events.ts stays append-only for normal application code.
import { PDFDocument } from 'pdf-lib';
import { prisma } from './prisma';
import { getSystemReport } from './system-report';
import { buildReportPdf } from './report-pdf';

/** Supabase free tier database size. Override with DB_CAPACITY_MB if the plan changes. */
export const DEFAULT_CAPACITY_MB = 500;
/** Cap on records merged into one backup PDF, to stay inside serverless time/memory limits. */
export const MAX_BACKUP_RECORDS = 100;

export interface TableUsage {
  name: string;
  rows: number;
  bytes: number;
}

export interface StorageUsage {
  usedBytes: number;
  capacityBytes: number;
  usedPercent: number;
  tables: TableUsage[];
}

export interface RecordSummary {
  id: string;
  systemName: string;
  classification: string;
  timestamp: string;
}

export interface PurgeCounts {
  assessments: number;
  checklistItems: number;
  auditEvents: number;
  draftSessions: number;
}

export type PurgeTarget = { ids: string[] } | { before: Date };

export function getCapacityBytes(): number {
  const mb = Number(process.env.DB_CAPACITY_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_CAPACITY_MB) * 1024 * 1024;
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const [{ size }] = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  // Table sizes include indexes and TOAST (large JSON/text), which is what the quota actually counts.
  const tableRows = await prisma.$queryRaw<{ name: string; rows: bigint; bytes: bigint }[]>`
    SELECT relname AS name, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(relid) DESC`;

  const usedBytes = Number(size);
  const capacityBytes = getCapacityBytes();
  return {
    usedBytes,
    capacityBytes,
    usedPercent: Math.min(100, Math.round((usedBytes / capacityBytes) * 1000) / 10),
    tables: tableRows.map((t) => ({ name: t.name, rows: Number(t.rows), bytes: Number(t.bytes) })),
  };
}

export async function listRecords(limit = 200): Promise<{ total: number; records: RecordSummary[] }> {
  const [total, rows] = await Promise.all([
    prisma.assessment.count(),
    prisma.assessment.findMany({
      orderBy: { timestamp: 'asc' }, // oldest first: these are the purge candidates
      take: limit,
      select: { id: true, systemName: true, classification: true, timestamp: true },
    }),
  ]);
  return {
    total,
    records: rows.map((r) => ({ ...r, timestamp: r.timestamp.toISOString() })),
  };
}

async function resolveAssessmentIds(target: PurgeTarget): Promise<string[]> {
  const where = 'ids' in target ? { id: { in: target.ids } } : { timestamp: { lt: target.before } };
  const found = await prisma.assessment.findMany({ where, select: { id: true } });
  return found.map((a) => a.id);
}

/** Drafts in progress are only purged by date, never by id: they are not shown as records. */
function draftWhere(target: PurgeTarget) {
  return 'before' in target ? { updatedAt: { lt: target.before } } : null;
}

function auditWhere(assessmentIds: string[], checklistItemIds: string[]) {
  return {
    OR: [
      { entityType: 'assessment', entityId: { in: assessmentIds } },
      { entityType: 'checklist_item', entityId: { in: checklistItemIds } },
    ],
  };
}

export async function previewPurge(target: PurgeTarget): Promise<PurgeCounts> {
  const ids = await resolveAssessmentIds(target);
  const items = await prisma.checklistItem.findMany({ where: { assessmentId: { in: ids } }, select: { id: true } });
  const draft = draftWhere(target);
  const [auditEvents, draftSessions] = await Promise.all([
    prisma.auditEvent.count({ where: auditWhere(ids, items.map((i) => i.id)) }),
    draft ? prisma.qaSession.count({ where: draft }) : Promise.resolve(0),
  ]);
  return { assessments: ids.length, checklistItems: items.length, auditEvents, draftSessions };
}

export async function purgeRecords(target: PurgeTarget, actorId: string): Promise<PurgeCounts> {
  const ids = await resolveAssessmentIds(target);
  const items = await prisma.checklistItem.findMany({ where: { assessmentId: { in: ids } }, select: { id: true } });
  const draft = draftWhere(target);

  const [auditEvents, checklistItems, assessments, draftSessions] = await prisma.$transaction([
    prisma.auditEvent.deleteMany({ where: auditWhere(ids, items.map((i) => i.id)) }),
    prisma.checklistItem.deleteMany({ where: { assessmentId: { in: ids } } }),
    prisma.assessment.deleteMany({ where: { id: { in: ids } } }),
    prisma.qaSession.deleteMany({ where: draft ?? { id: { in: [] } } }),
  ]);

  const counts: PurgeCounts = {
    assessments: assessments.count,
    checklistItems: checklistItems.count,
    auditEvents: auditEvents.count,
    draftSessions: draftSessions.count,
  };

  await prisma.auditEvent.create({
    data: {
      entityType: 'storage',
      entityId: 'purge',
      actorId,
      action: 'purge_records',
      newValue: {
        mode: 'before' in target ? 'before_date' : 'selected_ids',
        before: 'before' in target ? target.before.toISOString() : null,
        // Capped so the record of a big purge does not itself eat the space it freed.
        assessmentIds: ids.slice(0, 200),
        counts: { ...counts },
      },
    },
  });

  return counts;
}

/** Resolve the assessments a backup PDF covers, oldest first, capped at MAX_BACKUP_RECORDS. */
export async function resolveBackupIds(target: PurgeTarget): Promise<{ ids: string[]; truncated: boolean }> {
  const where = 'ids' in target ? { id: { in: target.ids } } : { timestamp: { lt: target.before } };
  const rows = await prisma.assessment.findMany({
    where,
    orderBy: { timestamp: 'asc' },
    take: MAX_BACKUP_RECORDS + 1,
    select: { id: true },
  });
  return { ids: rows.slice(0, MAX_BACKUP_RECORDS).map((r) => r.id), truncated: rows.length > MAX_BACKUP_RECORDS };
}

/** One PDF containing every requested record's full report, back to back. */
export async function buildBackupPdf(ids: string[], generatedAt: Date): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const id of ids) {
    const report = await getSystemReport(id);
    if (!report) continue;
    const single = await PDFDocument.load(await buildReportPdf(report, generatedAt));
    const pages = await merged.copyPages(single, single.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save();
}
