// lib/checklist.ts
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { recordAuditEvent } from './audit-events';
import type {
  ChecklistStatus,
  EvidenceChecklistItem,
  EvidenceChecklistItemDraft,
} from './classification-engine';

interface ChecklistRow {
  id: string;
  assessmentId: string;
  obligationArticle: string;
  title: string;
  description: string;
  requiredArtifact: string;
  status: string;
  owner: string | null;
  evidenceLink: string | null;
  lastUpdated: Date;
}

function mapRecord(row: ChecklistRow): EvidenceChecklistItem {
  return {
    id: row.id,
    obligationArticle: row.obligationArticle,
    title: row.title,
    description: row.description,
    requiredArtifact: row.requiredArtifact,
    status: row.status as ChecklistStatus,
    owner: row.owner,
    evidenceLink: row.evidenceLink,
    lastUpdated: row.lastUpdated.toISOString(),
  };
}

export interface ChecklistPatch {
  status?: ChecklistStatus;
  owner?: string | null;
  evidenceLink?: string | null;
}

/** Create the initial checklist rows for an assessment (inside its submission transaction). */
export async function createChecklistItems(
  tx: Prisma.TransactionClient,
  assessmentId: string,
  drafts: EvidenceChecklistItemDraft[]
): Promise<void> {
  if (drafts.length === 0) return;
  await tx.checklistItem.createMany({
    data: drafts.map(d => ({
      assessmentId,
      obligationArticle: d.obligationArticle,
      title: d.title,
      description: d.description,
      requiredArtifact: d.requiredArtifact,
      status: 'not_started',
      lastUpdated: new Date(),
    })),
  });
}

export async function getChecklistForAssessment(assessmentId: string): Promise<EvidenceChecklistItem[]> {
  const rows = await prisma.checklistItem.findMany({
    where: { assessmentId },
    orderBy: { obligationArticle: 'asc' },
  });
  return rows.map(mapRecord);
}

/**
 * Update status/owner/evidenceLink and write the matching audit event atomically.
 * Returns null when the item does not exist on this assessment.
 */
export async function updateChecklistItem(
  assessmentId: string,
  itemId: string,
  patch: ChecklistPatch,
  actorId: string
): Promise<EvidenceChecklistItem | null> {
  return prisma.$transaction(async tx => {
    const existing = await tx.checklistItem.findFirst({ where: { id: itemId, assessmentId } });
    if (!existing) return null;

    const previousValue: Record<string, unknown> = { assessmentId };
    const newValue: Record<string, unknown> = { assessmentId };
    const data: Record<string, unknown> = {};

    for (const field of ['status', 'owner', 'evidenceLink'] as const) {
      if (patch[field] !== undefined && patch[field] !== existing[field]) {
        previousValue[field] = existing[field];
        newValue[field] = patch[field];
        data[field] = patch[field];
      }
    }

    // Nothing changed: no write and no audit event
    if (Object.keys(data).length === 0) return mapRecord(existing);

    const updated = await tx.checklistItem.update({
      where: { id: itemId },
      data: { ...data, lastUpdated: new Date() },
    });

    await recordAuditEvent(tx, {
      entityType: 'checklist_item',
      entityId: itemId,
      actorId,
      action: 'checklist.updated',
      previousValue,
      newValue,
    });

    return mapRecord(updated);
  });
}
