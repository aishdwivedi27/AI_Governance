// __tests__/assessment-log.test.ts
import fs from 'fs';
import path from 'path';
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
  AssessmentRecord,
} from '../lib/assessment-log';

// Mock the getRulesVersion function to avoid file system access
jest.mock('../lib/classification-engine', () => ({
  getRulesVersion: jest.fn(() => '3.0.0'),
}));

// Mock file system operations for tests
jest.mock('fs');

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
    test('should append assessment with generated ID and timestamp', () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      const result = appendAssessment(mockAssessment);
      
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('rulesVersion');
      expect(result.systemName).toBe(mockAssessment.systemName);
      expect(result.classification).toBe(mockAssessment.classification);
    });

    test('should create data directory if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
      (fs.mkdirSync as jest.Mock).mockImplementationOnce(() => {});
      const result = appendAssessment(mockAssessment);
      
      expect(result.id).toBeTruthy();
      expect(result.timestamp).toBeTruthy();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    test('should generate unique IDs for multiple assessments', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      const assessment1 = appendAssessment(mockAssessment);
      const assessment2 = appendAssessment({
        ...mockAssessment,
        systemName: 'Another System',
      });

      expect(assessment1.id).not.toBe(assessment2.id);
    });

    test('should preserve all assessment data', () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      const result = appendAssessment(mockAssessment);
      
      expect(result.systemName).toBe(mockAssessment.systemName);
      expect(result.description).toBe(mockAssessment.description);
      expect(result.classification).toBe(mockAssessment.classification);
      expect(result.confidenceScore).toBe(mockAssessment.confidenceScore);
      expect(result.evidenceStrength).toBe(mockAssessment.evidenceStrength);
      expect(result.metadata).toEqual(mockAssessment.metadata);
    });
  });

  describe('readAllAssessments', () => {
    test('should return empty array if log file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
      const results = readAllAssessments();
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    test('should parse valid JSONL entries', () => {
      const mockData = [
        { id: '1', systemName: 'System 1', classification: 'HIGH_RISK' },
        { id: '2', systemName: 'System 2', classification: 'LIMITED_RISK' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const results = readAllAssessments();
      expect(results.length).toBe(2);
      expect(results[0].systemName).toBe('System 1');
      expect(results[1].systemName).toBe('System 2');
    });

    test('should handle malformed JSON gracefully', () => {
      const mockData = `{"id": "1", "systemName": "System 1"}
invalid json line
{"id": "2", "systemName": "System 2"}`;
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(mockData);

      const results = readAllAssessments();
      expect(results.length).toBe(2); // Only valid entries
      expect(results[0].id).toBe('1');
      expect(results[1].id).toBe('2');
    });

    test('should return assessments in order (oldest first)', () => {
      const mockData = [
        { id: '1', timestamp: '2024-01-01T00:00:00Z' },
        { id: '2', timestamp: '2024-01-02T00:00:00Z' },
        { id: '3', timestamp: '2024-01-03T00:00:00Z' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const results = readAllAssessments();
      expect(results[0].id).toBe('1');
      expect(results[1].id).toBe('2');
      expect(results[2].id).toBe('3');
    });
  });

  describe('getAssessmentById', () => {
    test('should find assessment by ID', () => {
      const mockData = [
        { id: 'test-id-1', systemName: 'System 1' },
        { id: 'test-id-2', systemName: 'System 2' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const result = getAssessmentById('test-id-2');
      expect(result).not.toBeNull();
      expect(result?.systemName).toBe('System 2');
    });

    test('should return null if assessment not found', () => {
      const mockData = [{ id: 'test-id-1', systemName: 'System 1' }];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const result = getAssessmentById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getLatestAssessments', () => {
    test('should return most recent assessments first', () => {
      const mockData = [
        { id: '1', timestamp: '2024-01-01T00:00:00Z', systemName: 'Old' },
        { id: '2', timestamp: '2024-01-02T00:00:00Z', systemName: 'New' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const results = getLatestAssessments(10);
      expect(results[0].id).toBe('2'); // Most recent
      expect(results[1].id).toBe('1');
    });

    test('should respect limit parameter', () => {
      const mockData = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        systemName: `System ${i}`,
      }));
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const results = getLatestAssessments(10);
      expect(results.length).toBe(10);
    });
  });

  describe('searchAssessments', () => {
    test('should find assessments by system name', () => {
      const mockData = [
        { id: '1', systemName: 'Facial Recognition', classification: 'HIGH_RISK', description: 'Test' },
        { id: '2', systemName: 'Email Filter', classification: 'MINIMAL_RISK', description: 'Test' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const results = searchAssessments('Facial');
      expect(results.length).toBe(1);
      expect(results[0].systemName).toBe('Facial Recognition');
    });

    test('should find assessments by classification', () => {
      const mockData = [
        { id: '1', systemName: 'System 1', classification: 'HIGH_RISK', description: 'Test' },
        { id: '2', systemName: 'System 2', classification: 'HIGH_RISK', description: 'Test' },
        { id: '3', systemName: 'System 3', classification: 'MINIMAL_RISK', description: 'Test' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const results = searchAssessments('HIGH_RISK');
      expect(results.length).toBe(2);
    });

    test('should be case-insensitive', () => {
      const mockData = [
        { id: '1', systemName: 'Facial Recognition', description: 'Test' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const results = searchAssessments('facial');
      expect(results.length).toBe(1);
    });
  });

  describe('getStatistics', () => {
    test('should calculate classification counts', () => {
      const mockData = [
        { id: '1', classification: 'HIGH_RISK' },
        { id: '2', classification: 'HIGH_RISK' },
        { id: '3', classification: 'LIMITED_RISK' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const stats = getStatistics();
      expect(stats.byClassification.HIGH_RISK).toBe(2);
      expect(stats.byClassification.LIMITED_RISK).toBe(1);
    });

    test('should calculate average confidence score', () => {
      const mockData = [
        { id: '1', confidenceScore: 80, classification: 'HIGH_RISK' },
        { id: '2', confidenceScore: 90, classification: 'HIGH_RISK' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const stats = getStatistics();
      expect(stats.averageConfidence).toBe(85);
    });

    test('should return zero stats for empty log', () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
      const stats = getStatistics();
      
      expect(stats.totalAssessments).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.lastAssessment).toBeNull();
    });
  });

  describe('exportAsJSON', () => {
    test('should export valid JSON', () => {
      const mockData = [
        { id: '1', systemName: 'System 1' },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const json = exportAsJSON();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].systemName).toBe('System 1');
    });
  });

  describe('exportAsCSV', () => {
    test('should export valid CSV format', () => {
      const mockData = [
        { 
          id: '1', 
          timestamp: '2024-01-01', 
          systemName: 'System 1',
          classification: 'HIGH_RISK',
          confidenceScore: 90,
          evidenceStrength: 85,
          rulesVersion: '3.0.0',
        },
      ];
      
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(
        mockData.map(d => JSON.stringify(d)).join('\n')
      );

      const csv = exportAsCSV();
      expect(csv).toContain('ID');
      expect(csv).toContain('System Name');
      expect(csv).toContain('HIGH_RISK');
    });

    test('should return empty string for empty log', () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
      const csv = exportAsCSV();
      expect(csv).toBe('');
    });
  });

  describe('getLogStats', () => {
    test('should return zero stats if log file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
      const stats = getLogStats();
      
      expect(stats.fileSize).toBe(0);
      expect(stats.fileSize_MB).toBe('0.00');
      expect(stats.entriesCount).toBe(0);
      expect(stats.createdAt).toBeNull();
    });
  });

  describe('Data Integrity', () => {
    test('should maintain immutability - no modifications to existing records', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      const assessment1 = appendAssessment(mockAssessment);
      const assessment2 = appendAssessment({
        ...mockAssessment,
        systemName: 'Different System',
      });

      expect(assessment1.id).not.toEqual(assessment2.id);
      expect(assessment1.systemName).toBe('Test System');
    });
  });
});