// __tests__/api-governance.test.ts
//
// Items 16-18: checklist PATCH, audit read, and Q&A session routes.
// Requests/responses are hand-built stubs (no HTTP mocking library installed).

import checklistItemHandler from '../pages/api/systems/[id]/checklist/[itemId]';
import auditHandler from '../pages/api/systems/[id]/audit';
import sessionsHandler from '../pages/api/sessions/index';
import sessionByIdHandler from '../pages/api/sessions/[id]';
import { createSessionToken, buildSessionCookie } from '../lib/auth';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    assessment: { findUnique: jest.fn() },
    checklistItem: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    auditEvent: { create: jest.fn(), findMany: jest.fn() },
    qaSession: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: any) => unknown) => cb(prisma));
  return { prisma };
});

// The audit/checklist lib modules import types only from the engine, but assessment-log
// imports getRulesVersion at runtime; avoid loading rules.yaml.
jest.mock('../lib/classification-engine', () => ({
  getRulesVersion: jest.fn(() => '3.0.0'),
  CHECKLIST_STATUSES: ['not_started', 'in_progress', 'complete', 'not_applicable'],
}));

const mockPrisma = prisma as unknown as Record<string, any>;

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-please-ignore';
});

beforeEach(() => {
  jest.clearAllMocks();
});

function mockRes() {
  const res: any = {
    statusCode: 200,
    _json: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this._json = payload;
      return this;
    },
    setHeader: jest.fn(),
  };
  return res;
}

function mockReq(overrides: Partial<{ method: string; body: any; query: any; cookie: string }> = {}) {
  return {
    method: overrides.method ?? 'GET',
    body: overrides.body ?? {},
    query: overrides.query ?? {},
    headers: overrides.cookie ? { cookie: overrides.cookie } : {},
  } as any;
}

function cookieFor(userId: string) {
  return buildSessionCookie(createSessionToken(userId));
}

function authAs(userId: string) {
  mockPrisma.user.findUnique.mockResolvedValueOnce({
    id: userId,
    email: `${userId}@example.com`,
    passwordHash: 'x',
    isSeedUser: false,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return cookieFor(userId);
}

function itemRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'item-1',
    assessmentId: 'a-1',
    obligationArticle: 'Article 9',
    title: 'Article 9: Risk Management System',
    description: 'd',
    requiredArtifact: 'Risk management file',
    status: 'not_started',
    owner: null,
    evidenceLink: null,
    lastUpdated: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('PATCH /api/systems/:id/checklist/:itemId', () => {
  const query = { id: 'a-1', itemId: 'item-1' };

  test('401 when unauthenticated', async () => {
    const res = mockRes();
    await checklistItemHandler(mockReq({ method: 'PATCH', query, body: { status: 'complete' } }), res);
    expect(res.statusCode).toBe(401);
    expect(mockPrisma.checklistItem.update).not.toHaveBeenCalled();
  });

  test('405 for non-PATCH methods', async () => {
    const res = mockRes();
    await checklistItemHandler(mockReq({ method: 'GET', query }), res);
    expect(res.statusCode).toBe(405);
  });

  test('400 for an invalid status', async () => {
    const res = mockRes();
    await checklistItemHandler(
      mockReq({ method: 'PATCH', query, body: { status: 'done' }, cookie: authAs('u1') }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  test('400 for a non-http evidence link', async () => {
    const res = mockRes();
    await checklistItemHandler(
      mockReq({
        method: 'PATCH',
        query,
        body: { evidenceLink: 'javascript:alert(1)' },
        cookie: authAs('u1'),
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  test('400 when no updatable field is supplied', async () => {
    const res = mockRes();
    await checklistItemHandler(
      mockReq({ method: 'PATCH', query, body: {}, cookie: authAs('u1') }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  test('404 when the item does not belong to the assessment', async () => {
    mockPrisma.checklistItem.findFirst.mockResolvedValueOnce(null);
    const res = mockRes();
    await checklistItemHandler(
      mockReq({ method: 'PATCH', query, body: { status: 'complete' }, cookie: authAs('u1') }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.checklistItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'item-1', assessmentId: 'a-1' },
    });
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });

  test('updates the item and writes an audit event with previous/new values in one transaction', async () => {
    mockPrisma.checklistItem.findFirst.mockResolvedValueOnce(itemRow());
    mockPrisma.checklistItem.update.mockResolvedValueOnce(
      itemRow({ status: 'complete', owner: 'Jane' })
    );

    const res = mockRes();
    await checklistItemHandler(
      mockReq({
        method: 'PATCH',
        query,
        body: { status: 'complete', owner: 'Jane' },
        cookie: authAs('u1'),
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res._json.item.status).toBe('complete');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        entityType: 'checklist_item',
        entityId: 'item-1',
        actorId: 'u1',
        action: 'checklist.updated',
        previousValue: { assessmentId: 'a-1', status: 'not_started', owner: null },
        newValue: { assessmentId: 'a-1', status: 'complete', owner: 'Jane' },
      },
    });
  });

  test('no write and no audit event when nothing changed', async () => {
    mockPrisma.checklistItem.findFirst.mockResolvedValueOnce(itemRow({ status: 'complete' }));
    const res = mockRes();
    await checklistItemHandler(
      mockReq({ method: 'PATCH', query, body: { status: 'complete' }, cookie: authAs('u1') }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.checklistItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/systems/:id/audit', () => {
  const query = { id: 'a-1' };

  test('401 when unauthenticated', async () => {
    const res = mockRes();
    await auditHandler(mockReq({ query }), res);
    expect(res.statusCode).toBe(401);
  });

  test('404 when the system does not exist', async () => {
    mockPrisma.assessment.findUnique.mockResolvedValueOnce(null);
    const res = mockRes();
    await auditHandler(mockReq({ query, cookie: authAs('u1') }), res);
    expect(res.statusCode).toBe(404);
  });

  test('returns assessment and checklist-item events, oldest first', async () => {
    mockPrisma.assessment.findUnique.mockResolvedValueOnce({
      id: 'a-1',
      timestamp: new Date(),
      metadata: {},
      violations: [],
      highRiskMatches: [],
    });
    mockPrisma.checklistItem.findMany.mockResolvedValueOnce([{ id: 'item-1' }, { id: 'item-2' }]);
    mockPrisma.auditEvent.findMany.mockResolvedValueOnce([
      {
        id: 'e1',
        entityType: 'assessment',
        entityId: 'a-1',
        actorId: 'u1',
        action: 'assessment.submitted',
        previousValue: null,
        newValue: { classification: 'HIGH_RISK' },
        timestamp: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const res = mockRes();
    await auditHandler(mockReq({ query, cookie: authAs('u1') }), res);

    expect(res.statusCode).toBe(200);
    expect(res._json.events).toHaveLength(1);
    expect(res._json.events[0].timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(mockPrisma.auditEvent.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { entityType: 'assessment', entityId: 'a-1' },
          { entityType: 'checklist_item', entityId: { in: ['item-1', 'item-2'] } },
        ],
      },
      orderBy: { timestamp: 'asc' },
    });
  });
});

describe('Q&A sessions', () => {
  function sessionRow(overrides: Partial<Record<string, any>> = {}) {
    return {
      id: 's-1',
      actorId: 'u1',
      answers: { q1: 'a' },
      currentStep: 'step-2',
      llmExchange: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  test('POST 401 when unauthenticated', async () => {
    const res = mockRes();
    await sessionsHandler(
      mockReq({ method: 'POST', body: { answers: {}, currentStep: 's' } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  test('POST 400 for invalid body', async () => {
    const res = mockRes();
    await sessionsHandler(
      mockReq({ method: 'POST', body: { answers: {}, currentStep: '' }, cookie: authAs('u1') }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  test('POST without id creates a session owned by the caller', async () => {
    mockPrisma.qaSession.create.mockResolvedValueOnce(sessionRow());
    const res = mockRes();
    await sessionsHandler(
      mockReq({
        method: 'POST',
        body: { answers: { q1: 'a' }, currentStep: 'step-2' },
        cookie: authAs('u1'),
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.qaSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 'u1', currentStep: 'step-2' }),
    });
  });

  test('POST with id updates an owned session', async () => {
    mockPrisma.qaSession.findFirst.mockResolvedValueOnce(sessionRow());
    mockPrisma.qaSession.update.mockResolvedValueOnce(sessionRow({ currentStep: 'step-3' }));
    const res = mockRes();
    await sessionsHandler(
      mockReq({
        method: 'POST',
        body: { id: 's-1', answers: { q1: 'a', q2: 'b' }, currentStep: 'step-3' },
        cookie: authAs('u1'),
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.qaSession.findFirst).toHaveBeenCalledWith({
      where: { id: 's-1', actorId: 'u1' },
    });
    expect(res._json.session.currentStep).toBe('step-3');
  });

  test("POST with id returns 404 for another user's session", async () => {
    mockPrisma.qaSession.findFirst.mockResolvedValueOnce(null);
    const res = mockRes();
    await sessionsHandler(
      mockReq({
        method: 'POST',
        body: { id: 's-1', answers: {}, currentStep: 'x' },
        cookie: authAs('u2'),
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.qaSession.update).not.toHaveBeenCalled();
  });

  test('GET resumes an owned session', async () => {
    mockPrisma.qaSession.findFirst.mockResolvedValueOnce(sessionRow());
    const res = mockRes();
    await sessionByIdHandler(mockReq({ query: { id: 's-1' }, cookie: authAs('u1') }), res);
    expect(res.statusCode).toBe(200);
    expect(res._json.session.answers).toEqual({ q1: 'a' });
  });

  test("GET returns 404 for another user's session", async () => {
    mockPrisma.qaSession.findFirst.mockResolvedValueOnce(null);
    const res = mockRes();
    await sessionByIdHandler(mockReq({ query: { id: 's-1' }, cookie: authAs('u2') }), res);
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.qaSession.findFirst).toHaveBeenCalledWith({
      where: { id: 's-1', actorId: 'u2' },
    });
  });

  test('GET 401 when unauthenticated', async () => {
    const res = mockRes();
    await sessionByIdHandler(mockReq({ query: { id: 's-1' } }), res);
    expect(res.statusCode).toBe(401);
  });
});
