// __tests__/report-pdf.test.ts
import { PDFDocument } from 'pdf-lib';
import { buildReportPdf, reportFilename } from '../lib/report-pdf';
import { getWizardRules } from '../lib/classification-engine';
import type { SystemReport } from '../lib/system-report';
import handler from '../pages/api/systems/[id]/report.pdf';
import { createSessionToken, buildSessionCookie } from '../lib/auth';
import { getSystemReport } from '../lib/system-report';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }));
jest.mock('../lib/system-report', () => ({ getSystemReport: jest.fn() }));

const mockGetReport = getSystemReport as jest.Mock;
const mockUserFind = (prisma as unknown as { user: { findUnique: jest.Mock } }).user.findUnique;

const rules = getWizardRules();

function report(overrides: Partial<SystemReport> = {}): SystemReport {
  return {
    assessment: {
      id: 'a-1',
      timestamp: '2026-09-01T10:00:00.000Z',
      systemName: 'Hiring Assistant',
      description: 'Ranks candidates',
      classification: 'HIGH_RISK',
      confidenceScore: 75,
      evidenceStrength: 90,
      violations: [],
      highRiskMatches: [],
      applicableArticles: ['Article 6: Classification'],
      obligations: [],
      reasoning: 'HIGH RISK (Annex III): matches Employment.',
      rulesVersion: '3.0.0',
      metadata: { industry: 'Employment/HR', geographies: ['EU'], fundamentalRightsImpact: false, crossBorderImpact: false },
    },
    answers: {
      systemName: 'Hiring Assistant',
      description: 'Ranks candidates',
      productType: 'decision_support',
      primaryFunction: 'Ranks applicants',
      role: ['deployer'],
      annex3Answers: { employment: 'unsure' },
    },
    governanceRequirements: [
      { role: 'deployer', ownerRole: 'Business System Owner', reviewCadence: 'Quarterly', escalationTrigger: 'Incident' },
    ],
    uncertainty: {
      unsureQuestions: [{ questionId: 'annex3.employment', label: 'Employment', treatedAs: 'Treated as applicable.' }],
      challengedAnswers: [],
      worstCaseClassification: 'HIGH_RISK',
      note: '1 answer was unsure.',
    },
    checklist: [
      {
        id: 'c-1',
        obligationArticle: 'Article 14',
        title: 'Article 14: Assign Human Oversight',
        description: 'd',
        requiredArtifact: 'Human oversight procedure',
        status: 'complete',
        owner: 'Priya',
        evidenceLink: 'https://example.com/evidence',
        lastUpdated: '2026-09-02T10:00:00.000Z',
      },
    ],
    rules,
    ...overrides,
  };
}

describe('buildReportPdf', () => {
  test('produces a valid multi-section PDF', async () => {
    const bytes = await buildReportPdf(report(), new Date('2026-09-19T12:00:00Z'));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain('Hiring Assistant');
  });

  test('does not throw on characters the standard font cannot encode', async () => {
    const r = report();
    r.assessment.systemName = 'Système 日本語 🚀';
    r.assessment.reasoning = 'Line one\nLine two\ttabbed – dash';
    r.checklist[0].evidenceLink = 'https://example.com/' + 'a'.repeat(300);
    await expect(buildReportPdf(r, new Date())).resolves.toBeInstanceOf(Uint8Array);
  });

  test('paginates a long checklist', async () => {
    const r = report();
    r.checklist = Array.from({ length: 60 }, (_, i) => ({ ...r.checklist[0], id: `c-${i}`, title: `Obligation ${i}` }));
    const doc = await PDFDocument.load(await buildReportPdf(r, new Date()));
    expect(doc.getPageCount()).toBeGreaterThan(2);
  });

  test('handles a legacy record with no answers or governance', async () => {
    const bytes = await buildReportPdf(report({ answers: null, governanceRequirements: [], uncertainty: null, checklist: [] }), new Date());
    expect(bytes.length).toBeGreaterThan(500);
  });
});

describe('reportFilename', () => {
  test('follows <systemName>-compliance-record-<YYYY-MM-DD>.pdf and is header-safe', () => {
    expect(reportFilename('Hiring Assistant', new Date('2026-09-19T23:59:00Z'))).toBe(
      'Hiring-Assistant-compliance-record-2026-09-19.pdf'
    );
    const nasty = reportFilename('a"b\r\nc/../d', new Date('2026-01-02T00:00:00Z'));
    expect(nasty).toMatch(/^[A-Za-z0-9._-]+-compliance-record-2026-01-02\.pdf$/);
    expect(reportFilename('日本語', new Date('2026-01-02T00:00:00Z'))).toBe(
      'system-compliance-record-2026-01-02.pdf'
    );
  });
});

describe('GET /api/systems/:id/report.pdf', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-please-ignore';
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockRes() {
    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(p: any) {
        this.body = p;
        return this;
      },
      send(p: any) {
        this.body = p;
        return this;
      },
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
    };
    return res;
  }

  const authed = () => {
    mockUserFind.mockResolvedValueOnce({
      id: 'u1',
      email: 'u@example.com',
      passwordHash: 'x',
      isSeedUser: false,
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { cookie: buildSessionCookie(createSessionToken('u1')) };
  };

  test('401 when unauthenticated', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: { id: 'a-1' }, headers: {} } as any, res);
    expect(res.statusCode).toBe(401);
    expect(mockGetReport).not.toHaveBeenCalled();
  });

  test('405 for other methods and 404 for an unknown system', async () => {
    const res405 = mockRes();
    await handler({ method: 'POST', query: { id: 'a-1' }, headers: {} } as any, res405);
    expect(res405.statusCode).toBe(405);

    mockGetReport.mockResolvedValueOnce(null);
    const res404 = mockRes();
    await handler({ method: 'GET', query: { id: 'nope' }, headers: authed() } as any, res404);
    expect(res404.statusCode).toBe(404);
  });

  test('streams a PDF with the right headers, reading live state at request time', async () => {
    mockGetReport.mockResolvedValueOnce(report());
    const res = mockRes();
    await handler({ method: 'GET', query: { id: 'a-1' }, headers: authed() } as any, res);

    expect(res.statusCode).toBe(200);
    expect(mockGetReport).toHaveBeenCalledWith('a-1');
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toMatch(/^attachment; filename="Hiring-Assistant-compliance-record-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(Buffer.from(res.body).slice(0, 5).toString()).toBe('%PDF-');
  });
});
