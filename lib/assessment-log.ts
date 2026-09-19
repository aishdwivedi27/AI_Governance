// lib/assessment-log.ts
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
import { getRulesVersion } from './classification-engine';
import { prisma } from './prisma';
import { recordAuditEvent } from './audit-events';
import { createChecklistItems } from './checklist';
import type { EvidenceChecklistItemDraft } from './classification-engine';
import type { WizardAnswers } from './assessment-flow';

export interface AssessmentRecord {
  id: string;
  timestamp: string;
  systemName: string;
  description: string;
  classification: string;
  confidenceScore: number;
  evidenceStrength: number;
  violations: any[];
  highRiskMatches: any[];
  applicableArticles: string[];
  obligations: string[];
  riskScore?: number;
  reasoning: string;
  rulesVersion: string;
  createdByUserId?: string;
  /** Submitted wizard answers; absent on records created before the wizard existed. */
  answers?: WizardAnswers;
  metadata: {
    industry: string;
    geographies: string[];
    fundamentalRightsImpact: boolean;
    crossBorderImpact: boolean;
  };
}

interface AssessmentRow {
  id: string;
  timestamp: Date;
  systemName: string;
  description: string;
  classification: string;
  confidenceScore: number;
  evidenceStrength: number;
  violations: unknown;
  highRiskMatches: unknown;
  applicableArticles: string[];
  obligations: string[];
  riskScore: number | null;
  reasoning: string;
  rulesVersion: string;
  createdByUserId?: string | null;
  answers?: unknown;
  metadata: unknown;
}

function mapRecord(row: AssessmentRow): AssessmentRecord {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    systemName: row.systemName,
    description: row.description,
    classification: row.classification,
    confidenceScore: row.confidenceScore,
    evidenceStrength: row.evidenceStrength,
    violations: row.violations as any[],
    highRiskMatches: row.highRiskMatches as any[],
    applicableArticles: row.applicableArticles,
    obligations: row.obligations,
    riskScore: row.riskScore ?? undefined,
    reasoning: row.reasoning,
    rulesVersion: row.rulesVersion,
    createdByUserId: row.createdByUserId ?? undefined,
    answers: (row.answers as WizardAnswers | null | undefined) ?? undefined,
    metadata: row.metadata as AssessmentRecord['metadata'],
  };
}

export interface AppendAssessmentOptions {
  actorId?: string;
  checklistDrafts?: EvidenceChecklistItemDraft[];
  /** Submitted wizard answers to snapshot on the record. */
  answers?: WizardAnswers;
}

/**
 * Append assessment to the immutable log
 * IMPORTANT: Never delete or modify entries
 * Each entry is immutable once written
 *
 * The assessment, its checklist items and the `assessment.submitted` audit
 * event are written in one transaction so none can exist without the others.
 */
export async function appendAssessment(
  assessment: Omit<AssessmentRecord, 'id' | 'timestamp' | 'rulesVersion' | 'createdByUserId' | 'answers'>,
  options: AppendAssessmentOptions = {}
): Promise<AssessmentRecord> {
  const drafts = options.checklistDrafts ?? [];
  const rulesVersion = getRulesVersion();

  const row = await prisma.$transaction(async tx => {
    const created = await tx.assessment.create({
      data: {
        ...assessment,
        id: uuidv4(),
        timestamp: new Date(),
        rulesVersion,
        createdByUserId: options.actorId,
        ...(options.answers && { answers: options.answers as unknown as Prisma.InputJsonValue }),
      },
    });

    await createChecklistItems(tx, created.id, drafts);

    await recordAuditEvent(tx, {
      entityType: 'assessment',
      entityId: created.id,
      actorId: options.actorId ?? null,
      action: 'assessment.submitted',
      newValue: {
        systemName: assessment.systemName,
        classification: assessment.classification,
        rulesVersion,
        checklistItemCount: drafts.length,
      },
    });

    return created;
  });

  return mapRecord(row);
}

/**
 * Read all assessments from the log
 * Returns in order (oldest first)
 */
export async function readAllAssessments(): Promise<AssessmentRecord[]> {
  const rows = await prisma.assessment.findMany({ orderBy: { timestamp: 'asc' } });
  return rows.map(mapRecord);
}

/**
 * Get single assessment by ID
 */
export async function getAssessmentById(id: string): Promise<AssessmentRecord | null> {
  const row = await prisma.assessment.findUnique({ where: { id } });
  return row ? mapRecord(row) : null;
}

/**
 * Get latest assessments (most recent first)
 */
export async function getLatestAssessments(limit: number = 20): Promise<AssessmentRecord[]> {
  const rows = await prisma.assessment.findMany({
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  return rows.map(mapRecord);
}

/**
 * Search assessments by system name, classification, or description
 */
export async function searchAssessments(query: string): Promise<AssessmentRecord[]> {
  const rows = await prisma.assessment.findMany({
    where: {
      OR: [
        { systemName: { contains: query, mode: 'insensitive' } },
        { classification: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
  });
  return rows.map(mapRecord);
}

/**
 * Get statistics
 */
export async function getStatistics() {
  const stats = {
    totalAssessments: 0,
    byClassification: {
      UNACCEPTABLE_RISK: 0,
      HIGH_RISK: 0,
      LIMITED_RISK: 0,
      MINIMAL_RISK: 0,
      GPAI: 0,
    },
    averageConfidence: 0,
    averageEvidence: 0,
    lastAssessment: null as AssessmentRecord | null,
  };

  const [total, avg, grouped, last] = await Promise.all([
    prisma.assessment.count(),
    prisma.assessment.aggregate({
      _avg: { confidenceScore: true, evidenceStrength: true },
    }),
    prisma.assessment.groupBy({
      by: ['classification'],
      _count: { _all: true },
    }),
    prisma.assessment.findFirst({ orderBy: { timestamp: 'desc' } }),
  ]);

  stats.totalAssessments = total;

  for (const group of grouped) {
    const classification = group.classification as keyof typeof stats.byClassification;
    if (classification in stats.byClassification) {
      stats.byClassification[classification] = group._count._all;
    }
  }

  if (total > 0) {
    stats.averageConfidence = Math.round(avg._avg.confidenceScore ?? 0);
    stats.averageEvidence = Math.round(avg._avg.evidenceStrength ?? 0);
    stats.lastAssessment = last ? mapRecord(last) : null;
  }

  return stats;
}

/**
 * Export assessment history as JSON
 */
export async function exportAsJSON(): Promise<string> {
  const assessments = await readAllAssessments();
  return JSON.stringify(assessments, null, 2);
}

/**
 * Export assessment history as CSV
 */
export async function exportAsCSV(): Promise<string> {
  const assessments = await readAllAssessments();

  if (assessments.length === 0) {
    return '';
  }

  // CSV Header
  const headers = [
    'ID',
    'Timestamp',
    'System Name',
    'Classification',
    'Confidence Score',
    'Evidence Strength',
    'Rules Version',
  ];

  // CSV rows
  const rows = assessments.map(a => [
    a.id,
    a.timestamp,
    a.systemName,
    a.classification,
    a.confidenceScore,
    a.evidenceStrength,
    a.rulesVersion,
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}

/**
 * Get storage stats. Unlike the old file-based log, "file size" has no
 * meaning for a database, so this reports entry count and the earliest/
 * latest assessment timestamps instead.
 */
export async function getLogStats() {
  const [entriesCount, first, last] = await Promise.all([
    prisma.assessment.count(),
    prisma.assessment.findFirst({ orderBy: { timestamp: 'asc' } }),
    prisma.assessment.findFirst({ orderBy: { timestamp: 'desc' } }),
  ]);

  if (entriesCount === 0) {
    return {
      storageType: 'postgresql',
      entriesCount: 0,
      createdAt: null,
      lastModified: null,
    };
  }

  return {
    storageType: 'postgresql',
    entriesCount,
    createdAt: first ? first.timestamp.toISOString() : null,
    lastModified: last ? last.timestamp.toISOString() : null,
  };
}
