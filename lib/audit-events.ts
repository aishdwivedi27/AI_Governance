// lib/audit-events.ts
// Append-only audit log. This module intentionally exports no update/delete functions.
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export interface AuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  action: string;
  previousValue: unknown;
  newValue: unknown;
  timestamp: string;
}

interface AuditEventRow {
  id: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  action: string;
  previousValue: unknown;
  newValue: unknown;
  timestamp: Date;
}

export interface NewAuditEvent {
  entityType: 'assessment' | 'checklist_item';
  entityId: string;
  actorId: string | null;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
}

function mapRecord(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    actorId: row.actorId,
    action: row.action,
    previousValue: row.previousValue ?? null,
    newValue: row.newValue ?? null,
    timestamp: row.timestamp.toISOString(),
  };
}

/**
 * Write one audit event. Pass the transaction client so the event commits or
 * rolls back together with the change it describes.
 */
export async function recordAuditEvent(
  client: Prisma.TransactionClient | typeof prisma,
  event: NewAuditEvent
): Promise<void> {
  await client.auditEvent.create({
    data: {
      entityType: event.entityType,
      entityId: event.entityId,
      actorId: event.actorId,
      action: event.action,
      previousValue:
        event.previousValue === undefined ? undefined : (event.previousValue as Prisma.InputJsonValue),
      newValue: event.newValue === undefined ? undefined : (event.newValue as Prisma.InputJsonValue),
    },
  });
}

/**
 * Full history for an assessment: its own events plus events on its checklist items.
 * Oldest first.
 */
export async function getAuditEventsForAssessment(assessmentId: string): Promise<AuditEvent[]> {
  const items = await prisma.checklistItem.findMany({
    where: { assessmentId },
    select: { id: true },
  });
  const itemIds = items.map((i: { id: string }) => i.id);

  const rows = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { entityType: 'assessment', entityId: assessmentId },
        ...(itemIds.length > 0
          ? [{ entityType: 'checklist_item', entityId: { in: itemIds } }]
          : []),
      ],
    },
    orderBy: { timestamp: 'asc' },
  });
  return rows.map(mapRecord);
}
