// __tests__/assessment-log.test.ts
import {
  appendAssessment,
  readAllAssessments,
  getAssessmentById,
  getLatestAssessments,
  searchAssessments,
  getStatistics,
  exportAsJSON,
  exportAsCSV,
  getLogStats,
} from '../lib/assessment-log';
import { prisma } from '../lib/prisma';

// Mock the getRulesVersion function to avoid file system access
jest.mock('../lib/classification-engine', () => ({
  getRulesVersion: jest.fn(() => '3.0.0'),
}));

// Mock the Prisma client instead of the filesystem
jest.mock('../lib/prisma', () => {
  const prisma: any = {
    assessment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    checklistItem: { createMany: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: any) => unknown) => cb(prisma));
  return { prisma };
});

const mockPrisma = prisma as unknown as {
  assessment: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
    groupBy: jest.Mock;
  };
  checklistItem: { createMany: jest.Mock };
  auditEvent: { create: jest.Mock };
  $transaction: jest.Mock;
};

function toRow(record: Partial<Record<string, any>>) {
  return {
    id: record.id ?? 'generated-id',
    timestamp: record.timestamp ? new Date(record.timestamp) : new Date('2024-01-01T00:00:00Z'),
    systemName: record.systemName ?? '',
    description: record.description ?? '',
    classification: record.classification ?? 'MINIMAL_RISK',
    confidenceScore: record.confidenceScore ?? 0,
    evidenceStrength: record.evidenceStrength ?? 0,
    violations: record.violations ?? [],
    highRiskMatches: record.highRiskMatches ?? [],
    applicableArticles: record.applicableArticles ?? [],
    obligations: record.obligations ?? [],
    riskScore: record.riskScore ?? null,
    reasoning: record.reasoning ?? '',
    rulesVersion: record.rulesVersion ?? '3.0.0',
    metadata: record.metadata ?? {},
  };
}

describe('Assessment Log', () => {
  const mockAssessment = {
    systemName: 'Test System',
    description: 'Test Description',
    classification: 'HIGH_RISK',
    confidenceScore: 85,
    evidenceStrength: 90,
    violations: [],
    highRiskMatches: [],
    applicableArticles: ['Article 6'],
    obligations: ['Compliance'],
    reasoning: 'Test reasoning',
    metadata: {
      industry: 'Healthcare',
      geographies: ['EU'],
      fundamentalRightsImpact: true,
      crossBorderImpact: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('appendAssessment', () => {
    test('should append assessment with generated ID and timestamp', async () => {
      mockPrisma.assessment.create.mockImplementationOnce(({ data }: any) =>
        Promise.resolve(toRow(data))
      );

      const result = await appendAssessment(mockAssessment);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('rulesVersion');
      expect(result.systemName).toBe(mockAssessment.systemName);
      expect(result.classification).toBe(mockAssessment.classification);
    });

    test('should generate unique IDs for multiple assessments', async () => {
      mockPrisma.assessment.create.mockImplementation(({ data }: any) =>
        Promise.resolve(toRow(data))
      );

      const assessment1 = await appendAssessment(mockAssessment);
      const assessment2 = await appendAssessment({
        ...mockAssessment,
        systemName: 'Another System',
      });

      expect(assessment1.id).not.toBe(assessment2.id);
    });

    test('should preserve all assessment data', async () => {
      mockPrisma.assessment.create.mockImplementationOnce(({ data }: any) =>
        Promise.resolve(toRow(data))
      );

      const result = await appendAssessment(mockAssessment);

      expect(result.systemName).toBe(mockAssessment.systemName);
      expect(result.description).toBe(mockAssessment.description);
      expect(result.classification).toBe(mockAssessment.classification);
      expect(result.confidenceScore).toBe(mockAssessment.confidenceScore);
      expect(result.evidenceStrength).toBe(mockAssessment.evidenceStrength);
      expect(result.metadata).toEqual(mockAssessment.metadata);
    });

    test('writes assessment, checklist items and an audit event in one transaction', async () => {
      mockPrisma.assessment.create.mockImplementationOnce(({ data }: any) =>
        Promise.resolve(toRow(data))
      );

      const drafts = [
        {
          obligationArticle: 'Article 9',
          title: 'Article 9: Risk Management System',
          description: 'd',
          requiredArtifact: 'Risk management file',
        },
      ];
      const result = await appendAssessment(mockAssessment, {
        actorId: 'user-1',
        checklistDrafts: drafts,
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.assessment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdByUserId: 'user-1' }),
        })
      );
      expect(mockPrisma.checklistItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            assessmentId: result.id,
            obligationArticle: 'Article 9',
            status: 'not_started',
          }),
        ],
      });
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'assessment',
          entityId: result.id,
          actorId: 'user-1',
          action: 'assessment.submitted',
        }),
      });
    });

    test('should call prisma.assessment.create with a rules version stamp', async () => {
      mockPrisma.assessment.create.mockImplementationOnce(({ data }: any) =>
        Promise.resolve(toRow(data))
      );

      await appendAssessment(mockAssessment);

      expect(mockPrisma.assessment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rulesVersion: '3.0.0' }),
        })
      );
    });
  });

  describe('readAllAssessments', () => {
    test('should return empty array if there are no records', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([]);
      const results = await readAllAssessments();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    test('should map DB rows into AssessmentRecord shape', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([
        toRow({ id: '1', systemName: 'System 1', classification: 'HIGH_RISK' }),
        toRow({ id: '2', systemName: 'System 2', classification: 'LIMITED_RISK' }),
      ]);

      const results = await readAllAssessments();
      expect(results.length).toBe(2);
      expect(results[0].systemName).toBe('System 1');
      expect(results[1].systemName).toBe('System 2');
      expect(typeof results[0].timestamp).toBe('string');
    });

    test('should return assessments in order (oldest first)', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([
        toRow({ id: '1', timestamp: '2024-01-01T00:00:00Z' }),
        toRow({ id: '2', timestamp: '2024-01-02T00:00:00Z' }),
        toRow({ id: '3', timestamp: '2024-01-03T00:00:00Z' }),
      ]);

      const results = await readAllAssessments();
      expect(results[0].id).toBe('1');
      expect(results[1].id).toBe('2');
      expect(results[2].id).toBe('3');
      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { timestamp: 'asc' } })
      );
    });
  });

  describe('getAssessmentById', () => {
    test('should find assessment by ID', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValueOnce(
        toRow({ id: 'test-id-2', systemName: 'System 2' })
      );

      const result = await getAssessmentById('test-id-2');
      expect(result).not.toBeNull();
      expect(result?.systemName).toBe('System 2');
    });

    test('should return null if assessment not found', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValueOnce(null);

      const result = await getAssessmentById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getLatestAssessments', () => {
    test('should return most recent assessments first', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([
        toRow({ id: '2', timestamp: '2024-01-02T00:00:00Z', systemName: 'New' }),
        toRow({ id: '1', timestamp: '2024-01-01T00:00:00Z', systemName: 'Old' }),
      ]);

      const results = await getLatestAssessments(10);
      expect(results[0].id).toBe('2'); // Most recent
      expect(results[1].id).toBe('1');
      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { timestamp: 'desc' }, take: 10 })
      );
    });

    test('should pass the limit through to the query', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => toRow({ id: `${i}`, systemName: `System ${i}` }))
      );

      const results = await getLatestAssessments(10);
      expect(results.length).toBe(10);
      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });
  });

  describe('searchAssessments', () => {
    test('should find assessments by system name', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([
        toRow({ id: '1', systemName: 'Facial Recognition', classification: 'HIGH_RISK', description: 'Test' }),
      ]);

      const results = await searchAssessments('Facial');
      expect(results.length).toBe(1);
      expect(results[0].systemName).toBe('Facial Recognition');
      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { systemName: { contains: 'Facial', mode: 'insensitive' } },
              { classification: { contains: 'Facial', mode: 'insensitive' } },
              { description: { contains: 'Facial', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    test('should find assessments by classification', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([
        toRow({ id: '1', systemName: 'System 1', classification: 'HIGH_RISK', description: 'Test' }),
        toRow({ id: '2', systemName: 'System 2', classification: 'HIGH_RISK', description: 'Test' }),
      ]);

      const results = await searchAssessments('HIGH_RISK');
      expect(results.length).toBe(2);
    });
  });

  describe('getStatistics', () => {
    test('should calculate classification counts', async () => {
      mockPrisma.assessment.count.mockResolvedValueOnce(3);
      mockPrisma.assessment.aggregate.mockResolvedValueOnce({
        _avg: { confidenceScore: 85, evidenceStrength: 88 },
      });
      mockPrisma.assessment.groupBy.mockResolvedValueOnce([
        { classification: 'HIGH_RISK', _count: { _all: 2 } },
        { classification: 'LIMITED_RISK', _count: { _all: 1 } },
      ]);
      mockPrisma.assessment.findFirst.mockResolvedValueOnce(toRow({ id: '3' }));

      const stats = await getStatistics();
      expect(stats.byClassification.HIGH_RISK).toBe(2);
      expect(stats.byClassification.LIMITED_RISK).toBe(1);
      expect(stats.totalAssessments).toBe(3);
    });

    test('should calculate average confidence score', async () => {
      mockPrisma.assessment.count.mockResolvedValueOnce(2);
      mockPrisma.assessment.aggregate.mockResolvedValueOnce({
        _avg: { confidenceScore: 85, evidenceStrength: 88 },
      });
      mockPrisma.assessment.groupBy.mockResolvedValueOnce([]);
      mockPrisma.assessment.findFirst.mockResolvedValueOnce(toRow({ id: '1' }));

      const stats = await getStatistics();
      expect(stats.averageConfidence).toBe(85);
    });

    test('should return zero stats for empty log', async () => {
      mockPrisma.assessment.count.mockResolvedValueOnce(0);
      mockPrisma.assessment.aggregate.mockResolvedValueOnce({
        _avg: { confidenceScore: null, evidenceStrength: null },
      });
      mockPrisma.assessment.groupBy.mockResolvedValueOnce([]);
      mockPrisma.assessment.findFirst.mockResolvedValueOnce(null);

      const stats = await getStatistics();
      expect(stats.totalAssessments).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.lastAssessment).toBeNull();
    });
  });

  describe('exportAsJSON', () => {
    test('should export valid JSON', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([
        toRow({ id: '1', systemName: 'System 1' }),
      ]);

      const json = await exportAsJSON();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].systemName).toBe('System 1');
    });
  });

  describe('exportAsCSV', () => {
    test('should export valid CSV format', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([
        toRow({
          id: '1',
          timestamp: '2024-01-01T00:00:00Z',
          systemName: 'System 1',
          classification: 'HIGH_RISK',
          confidenceScore: 90,
          evidenceStrength: 85,
          rulesVersion: '3.0.0',
        }),
      ]);

      const csv = await exportAsCSV();
      expect(csv).toContain('ID');
      expect(csv).toContain('System Name');
      expect(csv).toContain('HIGH_RISK');
    });

    test('should return empty string for empty log', async () => {
      mockPrisma.assessment.findMany.mockResolvedValueOnce([]);
      const csv = await exportAsCSV();
      expect(csv).toBe('');
    });
  });

  describe('getLogStats', () => {
    test('should return zero stats if there are no records', async () => {
      mockPrisma.assessment.count.mockResolvedValueOnce(0);
      mockPrisma.assessment.findFirst.mockResolvedValueOnce(null);

      const stats = await getLogStats();

      expect(stats.entriesCount).toBe(0);
      expect(stats.createdAt).toBeNull();
      expect(stats.lastModified).toBeNull();
      expect(stats.storageType).toBe('postgresql');
    });

    test('should return earliest/latest timestamps when records exist', async () => {
      mockPrisma.assessment.count.mockResolvedValueOnce(2);
      mockPrisma.assessment.findFirst
        .mockResolvedValueOnce(toRow({ id: '1', timestamp: '2024-01-01T00:00:00Z' }))
        .mockResolvedValueOnce(toRow({ id: '2', timestamp: '2024-01-02T00:00:00Z' }));

      const stats = await getLogStats();

      expect(stats.entriesCount).toBe(2);
      expect(stats.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(stats.lastModified).toBe('2024-01-02T00:00:00.000Z');
    });
  });

  describe('Data Integrity', () => {
    test('should maintain immutability - no modifications to existing records', async () => {
      mockPrisma.assessment.create.mockImplementation(({ data }: any) =>
        Promise.resolve(toRow(data))
      );

      const assessment1 = await appendAssessment(mockAssessment);
      const assessment2 = await appendAssessment({
        ...mockAssessment,
        systemName: 'Different System',
      });

      expect(assessment1.id).not.toEqual(assessment2.id);
      expect(assessment1.systemName).toBe('Test System');
    });
  });
});
