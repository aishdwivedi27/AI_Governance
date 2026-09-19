// lib/qa-sessions.ts
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export interface QASession {
  id: string;
  actorId: string;
  answers: Record<string, unknown>;
  currentStep: string;
  llmExchange: unknown | null;
  createdAt: string;
  updatedAt: string;
}

interface QaSessionRow {
  id: string;
  actorId: string | null;
  answers: unknown;
  currentStep: string;
  llmExchange: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function mapRecord(row: QaSessionRow): QASession {
  return {
    id: row.id,
    actorId: row.actorId ?? '',
    answers: row.answers as Record<string, unknown>,
    currentStep: row.currentStep,
    llmExchange: row.llmExchange ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface QASessionDraft {
  answers: Record<string, unknown>;
  currentStep: string;
  llmExchange?: unknown;
}

export async function createQASession(actorId: string, draft: QASessionDraft): Promise<QASession> {
  const row = await prisma.qaSession.create({
    data: {
      actorId,
      answers: draft.answers as Prisma.InputJsonValue,
      currentStep: draft.currentStep,
      llmExchange:
        draft.llmExchange === undefined || draft.llmExchange === null
          ? undefined
          : (draft.llmExchange as Prisma.InputJsonValue),
    },
  });
  return mapRecord(row);
}

/** Returns the session only if it belongs to `actorId`. */
export async function getQASessionForActor(id: string, actorId: string): Promise<QASession | null> {
  const row = await prisma.qaSession.findFirst({ where: { id, actorId } });
  return row ? mapRecord(row) : null;
}

/** The caller's most recently updated unsubmitted drafts, for "Resume draft". */
export async function listQASessionsForActor(actorId: string, limit = 10): Promise<QASession[]> {
  const rows = await prisma.qaSession.findMany({
    where: { actorId, NOT: { currentStep: { in: ['submitted', 'not_in_scope'] } } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return rows.map(mapRecord);
}

/**
 * Read-modify-write of the session's LLM exchange (suggestions, clarification transcripts).
 * Returns false when the session does not exist or is owned by someone else.
 */
export async function updateLLMExchangeForActor(
  id: string,
  actorId: string,
  mutate: (current: Record<string, any>) => Record<string, any>
): Promise<boolean> {
  const existing = await prisma.qaSession.findFirst({ where: { id, actorId } });
  if (!existing) return false;

  const current =
    existing.llmExchange && typeof existing.llmExchange === 'object' && !Array.isArray(existing.llmExchange)
      ? (existing.llmExchange as Record<string, any>)
      : {};
  await prisma.qaSession.update({
    where: { id },
    data: { llmExchange: mutate(current) as Prisma.InputJsonValue },
  });
  return true;
}

/** Updates a draft owned by `actorId`; null if it does not exist or belongs to someone else. */
export async function updateQASessionForActor(
  id: string,
  actorId: string,
  draft: QASessionDraft
): Promise<QASession | null> {
  const existing = await prisma.qaSession.findFirst({ where: { id, actorId } });
  if (!existing) return null;

  const row = await prisma.qaSession.update({
    where: { id },
    data: {
      answers: draft.answers as Prisma.InputJsonValue,
      currentStep: draft.currentStep,
      ...(draft.llmExchange !== undefined && {
        llmExchange:
          draft.llmExchange === null ? Prisma.DbNull : (draft.llmExchange as Prisma.InputJsonValue),
      }),
    },
  });
  return mapRecord(row);
}
