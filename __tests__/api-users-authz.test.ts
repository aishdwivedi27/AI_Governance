// __tests__/api-users-authz.test.ts
//
// Confirms seed-only enforcement (item 14): non-seed users get 403,
// unauthenticated requests get 401, and the seed user succeeds, on every
// /api/users* route. No HTTP-mocking library is installed, so requests/
// responses are hand-built minimal stubs matching the subset of
// NextApiRequest/NextApiResponse the handlers actually touch.

import usersIndexHandler from '../pages/api/users/index';
import userPasswordHandler from '../pages/api/users/[id]/password';
import userDeleteHandler from '../pages/api/users/[id]/index';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as unknown as {
  user: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

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

function userRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: overrides.id ?? 'actor-1',
    email: overrides.email ?? 'actor@example.com',
    passwordHash: overrides.passwordHash ?? 'hashed',
    isSeedUser: overrides.isSeedUser ?? false,
    createdByUserId: overrides.createdByUserId ?? null,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2024-01-01T00:00:00Z'),
  };
}

// Build a valid session cookie header for the given userId using the real
// lib/auth token format, so requireAuth/requireSeedUser can verify it.
function cookieFor(userId: string): string {
  const { createSessionToken, buildSessionCookie } = require('../lib/auth');
  const setCookie: string = buildSessionCookie(createSessionToken(userId));
  return setCookie.split(';')[0]; // "session=<token>"
}

describe('GET/POST /api/users (seed-only)', () => {
  it('returns 401 when there is no session cookie', async () => {
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    await usersIndexHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for a non-seed authenticated user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: false }));
    const req = mockReq({ method: 'GET', cookie: cookieFor('actor-1') });
    const res = mockRes();
    await usersIndexHandler(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('lists users for the seed user (GET)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: true }));
    mockPrisma.user.findMany.mockResolvedValueOnce([userRow({ id: 'u2' })]);
    const req = mockReq({ method: 'GET', cookie: cookieFor('actor-1') });
    const res = mockRes();
    await usersIndexHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.findMany).toHaveBeenCalled();
  });

  it('creates a user for the seed user (POST)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: true }));
    mockPrisma.user.create.mockResolvedValueOnce(userRow({ id: 'new-user' }));
    const req = mockReq({
      method: 'POST',
      cookie: cookieFor('actor-1'),
      body: { email: 'new@example.com', password: 'password123' },
    });
    const res = mockRes();
    await usersIndexHandler(req, res);
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalled();
  });
});

describe('POST /api/users/:id/password (seed-only)', () => {
  it('returns 401 when there is no session cookie', async () => {
    const req = mockReq({ method: 'POST', query: { id: 'target-1' } });
    const res = mockRes();
    await userPasswordHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for a non-seed authenticated user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: false }));
    const req = mockReq({
      method: 'POST',
      cookie: cookieFor('actor-1'),
      query: { id: 'target-1' },
      body: { password: 'newpassword1' },
    });
    const res = mockRes();
    await userPasswordHandler(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('resets the password for the seed user, including its own id', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: true })) // requireSeedUser lookup
      .mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: true })); // findUserById(target)
    mockPrisma.user.update.mockResolvedValueOnce(userRow({ id: 'actor-1' }));
    const req = mockReq({
      method: 'POST',
      cookie: cookieFor('actor-1'),
      query: { id: 'actor-1' },
      body: { password: 'newpassword1' },
    });
    const res = mockRes();
    await userPasswordHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });
});

describe('DELETE /api/users/:id (seed-only)', () => {
  it('returns 401 when there is no session cookie', async () => {
    const req = mockReq({ method: 'DELETE', query: { id: 'target-1' } });
    const res = mockRes();
    await userDeleteHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for a non-seed authenticated user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: false }));
    const req = mockReq({ method: 'DELETE', cookie: cookieFor('actor-1'), query: { id: 'target-1' } });
    const res = mockRes();
    await userDeleteHandler(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when the seed user tries to delete themselves', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: true }));
    const req = mockReq({ method: 'DELETE', cookie: cookieFor('actor-1'), query: { id: 'actor-1' } });
    const res = mockRes();
    await userDeleteHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the target user does not exist', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: true })) // requireSeedUser lookup
      .mockResolvedValueOnce(null); // findUserById(target)
    const req = mockReq({ method: 'DELETE', cookie: cookieFor('actor-1'), query: { id: 'missing' } });
    const res = mockRes();
    await userDeleteHandler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('deletes the target user for the seed user', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(userRow({ id: 'actor-1', isSeedUser: true })) // requireSeedUser lookup
      .mockResolvedValueOnce(userRow({ id: 'target-1' })); // findUserById(target)
    mockPrisma.user.delete.mockResolvedValueOnce(userRow({ id: 'target-1' }));
    const req = mockReq({ method: 'DELETE', cookie: cookieFor('actor-1'), query: { id: 'target-1' } });
    const res = mockRes();
    await userDeleteHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'target-1' } });
  });
});
