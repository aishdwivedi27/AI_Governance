// __tests__/api-admin-storage.test.ts
//
// Storage admin routes are seed-user-only, validate purge input, delete an assessment's
// dependents with it, and leave a summary audit event behind.

import storageHandler from '../pages/api/admin/storage';
import purgeHandler from '../pages/api/admin/purge';
import backupHandler from '../pages/api/admin/backup.pdf';
import { getCapacityBytes } from '../lib/storage-admin';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    assessment: { findMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
    checklistItem: { findMany: jest.fn(), deleteMany: jest.fn() },
    auditEvent: { count: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    qaSession: { count: jest.fn(), deleteMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

const db = prisma as unknown as Record<string, any>;

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-please-ignore';
});
beforeEach(() => {
  jest.resetAllMocks();
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
    send: jest.fn(),
  };
  return res;
}

function mockReq(o: Partial<{ method: string; body: any; query: any; cookie: string }> = {}) {
  return {
    method: o.method ?? 'GET',
    body: o.body ?? {},
    query: o.query ?? {},
    headers: o.cookie ? { cookie: o.cookie } : {},
  } as any;
}

function userRow(isSeedUser: boolean) {
  return {
    id: 'actor-1',
    email: 'a@example.com',
    passwordHash: 'x',
    isSeedUser,
    createdByUserId: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
}

function cookieFor(userId: string): string {
  const { createSessionToken, buildSessionCookie } = require('../lib/auth');
  return (buildSessionCookie(createSessionToken(userId)) as string).split(';')[0];
}

const seedReq = (o: Parameters<typeof mockReq>[0] = {}) => {
  db.user.findUnique.mockResolvedValue(userRow(true));
  return mockReq({ ...o, cookie: cookieFor('actor-1') });
};

describe('authorisation', () => {
  const routes: [string, any, string][] = [
    ['storage', storageHandler, 'GET'],
    ['purge', purgeHandler, 'POST'],
    ['backup.pdf', backupHandler, 'GET'],
  ];

  it.each(routes)('%s returns 401 without a session', async (_n, handler, method) => {
    const res = mockRes();
    await handler(mockReq({ method }), res);
    expect(res.statusCode).toBe(401);
  });

  it.each(routes)('%s returns 403 for a non-seed user', async (_n, handler, method) => {
    db.user.findUnique.mockResolvedValue(userRow(false));
    const res = mockRes();
    await handler(mockReq({ method, cookie: cookieFor('actor-1') }), res);
    expect(res.statusCode).toBe(403);
    expect(db.assessment.deleteMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/storage', () => {
  it('reports usage against the configured capacity', async () => {
    db.$queryRaw
      .mockResolvedValueOnce([{ size: BigInt(50 * 1024 * 1024) }])
      .mockResolvedValueOnce([{ name: 'Assessment', rows: BigInt(3), bytes: BigInt(2048) }]);
    db.assessment.count.mockResolvedValue(3);
    db.assessment.findMany.mockResolvedValue([
      { id: 'a1', systemName: 'Bot', classification: 'HIGH_RISK', timestamp: new Date('2026-01-01T00:00:00Z') },
    ]);

    const res = mockRes();
    await storageHandler(seedReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res._json.usage.usedPercent).toBe(10); // 50 MB of the default 500 MB
    expect(res._json.usage.tables[0]).toEqual({ name: 'Assessment', rows: 3, bytes: 2048 });
    expect(res._json.total).toBe(3);
  });

  it('honours DB_CAPACITY_MB', () => {
    process.env.DB_CAPACITY_MB = '1000';
    expect(getCapacityBytes()).toBe(1000 * 1024 * 1024);
    delete process.env.DB_CAPACITY_MB;
    expect(getCapacityBytes()).toBe(500 * 1024 * 1024);
  });
});

describe('POST /api/admin/purge', () => {
  it('rejects a request with neither ids nor a date', async () => {
    const res = mockRes();
    await purgeHandler(seedReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an empty selection, an invalid date and a future date', async () => {
    for (const body of [{ ids: [] }, { before: 'not-a-date' }, { before: '2999-01-01T00:00:00Z' }]) {
      const res = mockRes();
      await purgeHandler(seedReq({ method: 'POST', body }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(db.assessment.deleteMany).not.toHaveBeenCalled();
  });

  it('dry run counts without deleting', async () => {
    db.assessment.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    db.checklistItem.findMany.mockResolvedValue([{ id: 'c1' }]);
    db.auditEvent.count.mockResolvedValue(5);
    db.qaSession.count.mockResolvedValue(2);

    const res = mockRes();
    await purgeHandler(seedReq({ method: 'POST', body: { before: '2026-01-01T00:00:00Z', dryRun: true } }), res);

    expect(res.statusCode).toBe(200);
    expect(res._json).toEqual({
      dryRun: true,
      counts: { assessments: 2, checklistItems: 1, auditEvents: 5, draftSessions: 2 },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('deletes selected records with their dependents and logs the purge', async () => {
    db.assessment.findMany.mockResolvedValue([{ id: 'a1' }]);
    db.checklistItem.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    db.$transaction.mockResolvedValue([{ count: 4 }, { count: 2 }, { count: 1 }, { count: 0 }]);

    const res = mockRes();
    await purgeHandler(seedReq({ method: 'POST', body: { ids: ['a1'] } }), res);

    expect(res.statusCode).toBe(200);
    expect(res._json.counts).toEqual({ assessments: 1, checklistItems: 2, auditEvents: 4, draftSessions: 0 });
    expect(db.auditEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { entityType: 'assessment', entityId: { in: ['a1'] } },
          { entityType: 'checklist_item', entityId: { in: ['c1', 'c2'] } },
        ],
      },
    });
    expect(db.checklistItem.deleteMany).toHaveBeenCalledWith({ where: { assessmentId: { in: ['a1'] } } });
    // Deleting by id must never sweep up draft sessions.
    expect(db.qaSession.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [] } } });
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'storage', action: 'purge_records', actorId: 'actor-1' }),
      })
    );
  });
});

describe('GET /api/admin/backup.pdf', () => {
  it('rejects an invalid date', async () => {
    const res = mockRes();
    await backupHandler(seedReq({ query: { before: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when no records are older than the date', async () => {
    db.assessment.findMany.mockResolvedValue([]);
    const res = mockRes();
    await backupHandler(seedReq({ query: { before: '2026-01-01T00:00:00Z' } }), res);
    expect(res.statusCode).toBe(404);
  });
});
