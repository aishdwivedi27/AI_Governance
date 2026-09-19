// __tests__/api-classify.test.ts
// POST /api/classify with structured wizard answers, and GET /api/sessions (draft list).
import classifyHandler from '../pages/api/classify';
import sessionsHandler from '../pages/api/sessions/index';
import { createSessionToken, buildSessionCookie } from '../lib/auth';
import { getWizardRules } from '../lib/classification-engine';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    assessment: { create: jest.fn() },
    checklistItem: { createMany: jest.fn(), findMany: jest.fn() },
    auditEvent: { create: jest.fn() },
    qaSession: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: any) => unknown) => cb(prisma));
  return { prisma };
});

const db = prisma as unknown as Record<string, any>;
const rules = getWizardRules();

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
    json(p: any) {
      this._json = p;
      return this;
    },
    setHeader: jest.fn(),
  };
  return res;
}

function authedHeaders() {
  db.user.findUnique.mockResolvedValueOnce({
    id: 'u1',
    email: 'u@example.com',
    passwordHash: 'x',
    isSeedUser: false,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { cookie: buildSessionCookie(createSessionToken('u1')) };
}

const allNo = (keys: string[]) => Object.fromEntries(keys.map(k => [k, 'no']));

const wizardBody = {
  systemName: 'Spreadsheet helper',
  description: 'Formats spreadsheet columns for internal reports',
  industry: 'Software/Technology',
  geographies: ['EU'],
  vulnerableGroups: [],
  fundamentalRightsImpact: false,
  crossBorderImpact: false,
  role: ['deployer'],
  productType: 'other',
  isAISystem: true,
  primaryFunction: 'Formatting',
  annex1Answer: 'no',
  annex3Answers: { ...allNo(rules.annexIII.map(c => c.id)), healthcare_ai: 'unsure' },
  article5Answers: allNo(rules.article5.map(p => p.id)),
  generatesOrInteractsWithPeople: false,
  sessionId: 's-1',
  notAWizardKey: 'drop me',
};

describe('POST /api/classify (wizard submission)', () => {
  test('persists a sanitised answers snapshot, checklist and audit event, and marks the draft submitted', async () => {
    db.assessment.create.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ ...data, timestamp: data.timestamp, riskScore: null, createdByUserId: data.createdByUserId })
    );
    db.checklistItem.findMany.mockResolvedValueOnce([]);
    db.qaSession.findFirst.mockResolvedValueOnce({ id: 's-1', actorId: 'u1', llmExchange: null });
    db.qaSession.update.mockResolvedValueOnce({});

    const res = mockRes();
    await classifyHandler({ method: 'POST', body: wizardBody, query: {}, headers: authedHeaders() } as any, res);

    expect(res.statusCode).toBe(200);
    const a = res._json.assessment;
    expect(a.classification).toBe('HIGH_RISK'); // healthcare "unsure" is treated pessimistically
    expect(a.uncertainty.unsureQuestions).toHaveLength(1);
    expect(a.governanceRequirements).toHaveLength(1);

    const stored = db.assessment.create.mock.calls[0][0].data;
    expect(stored.createdByUserId).toBe('u1');
    expect(stored.answers.annex3Answers.healthcare_ai).toBe('unsure');
    expect(stored.answers.notAWizardKey).toBeUndefined();
    expect(stored.answers.sessionId).toBeUndefined();

    // "Resolve: ..." checklist draft is persisted alongside the obligations
    const created = db.checklistItem.createMany.mock.calls[0][0].data.map((d: any) => d.title);
    expect(created).toContain('Resolve: Healthcare and Medical AI Systems');
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'assessment.submitted', actorId: 'u1' }),
    });

    expect(db.qaSession.findFirst).toHaveBeenCalledWith({ where: { id: 's-1', actorId: 'u1' } });
    expect(db.qaSession.update.mock.calls[0][0].data.currentStep).toBe('submitted');
  });

  test('a bad structured answer is a 400 and nothing is written', async () => {
    const res = mockRes();
    await classifyHandler(
      { method: 'POST', body: { ...wizardBody, annex3Answers: { employment: 'maybe' } }, query: {}, headers: authedHeaders() } as any,
      res
    );
    expect(res.statusCode).toBe(400);
    expect(db.assessment.create).not.toHaveBeenCalled();
  });

  test('a session failure does not fail the submission', async () => {
    db.assessment.create.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...data, riskScore: null }));
    db.checklistItem.findMany.mockResolvedValueOnce([]);
    db.qaSession.findFirst.mockRejectedValueOnce(new Error('db hiccup'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = mockRes();
    await classifyHandler({ method: 'POST', body: wizardBody, query: {}, headers: authedHeaders() } as any, res);
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/sessions (draft list)', () => {
  test('401 when unauthenticated', async () => {
    const res = mockRes();
    await sessionsHandler({ method: 'GET', query: {}, headers: {} } as any, res);
    expect(res.statusCode).toBe(401);
  });

  test("lists the caller's own unsubmitted drafts, newest first", async () => {
    db.qaSession.findMany.mockResolvedValueOnce([
      {
        id: 's-1',
        actorId: 'u1',
        answers: { systemName: 'X' },
        currentStep: 'sector',
        llmExchange: null,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-02T00:00:00Z'),
      },
    ]);
    const res = mockRes();
    await sessionsHandler({ method: 'GET', query: {}, headers: authedHeaders() } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res._json.sessions[0]).toMatchObject({ id: 's-1', currentStep: 'sector' });
    expect(db.qaSession.findMany).toHaveBeenCalledWith({
      where: { actorId: 'u1', NOT: { currentStep: { in: ['submitted', 'not_in_scope'] } } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
  });
});
