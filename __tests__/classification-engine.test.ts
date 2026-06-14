// __tests__/classification-engine.test.ts
import { classifyAISystem, getRulesMetadata, getRulesVersion } from '../lib/classification-engine'
import type { AssessmentInput, ClassificationResult } from '../lib/classification-engine'

describe('Classification Engine', () => {
  const validInput: AssessmentInput = {
  systemName: 'Email Filter System',
  description: 'Simple email filtering and spam detection',
  industry: 'Software',
  geographies: ['EU'],
  vulnerableGroups: [],
  fundamentalRightsImpact: false,
  crossBorderImpact: false,
}; 

  describe('Input Validation', () => {
    test('should throw error if systemName is empty', () => {
      const invalidInput = { ...validInput, systemName: '' };
      expect(() => classifyAISystem(invalidInput)).toThrow('Validation failed');
    });

    test('should throw error if description is empty', () => {
      const invalidInput = { ...validInput, description: '' };
      expect(() => classifyAISystem(invalidInput)).toThrow('Validation failed');
    });

    test('should throw error if industry is empty', () => {
      const invalidInput = { ...validInput, industry: '' };
      expect(() => classifyAISystem(invalidInput)).toThrow('Validation failed');
    });

    test('should throw error if geographies array is empty', () => {
      const invalidInput = { ...validInput, geographies: [] };
      expect(() => classifyAISystem(invalidInput)).toThrow('Validation failed');
    });
  });

  describe('Article 5 - Prohibited Practices', () => {
    test('should classify as UNACCEPTABLE_RISK when social score detected', () => {
      const input: AssessmentInput = {
        ...validInput,
        systemName: 'Social Score System',
        description: 'System for calculating social score citizens',
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('UNACCEPTABLE_RISK');
      expect(result.confidenceScore).toBe(95);
      expect(result.evidenceStrength).toBe(100);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    test('should include violation details for Article 5 breaches', () => {
      const input: AssessmentInput = {
        ...validInput,
        systemName: 'Social Score',
        description: 'Prohibited practice detected',
      };
      const result = classifyAISystem(input);
      if (result.classification === 'UNACCEPTABLE_RISK') {
        result.violations.forEach(violation => {
          expect(violation).toHaveProperty('id');
          expect(violation).toHaveProperty('name');
          expect(violation).toHaveProperty('article');
          expect(violation).toHaveProperty('description');
        });
      }
    });
  });

  describe('Risk Score Calculation', () => {
    test('should return HIGH_RISK when risk score >= 20', () => {
      const input: AssessmentInput = {
        ...validInput,
        riskSeverity: 5,
        riskLikelihood: 5,
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('HIGH_RISK');
      expect(result.riskScore).toBe(25);
    });

    test('should return LIMITED_RISK when risk score >= 8 and < 20', () => {
      const input: AssessmentInput = {
        ...validInput,
        riskSeverity: 4,
        riskLikelihood: 2,
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('LIMITED_RISK');
      expect(result.riskScore).toBe(8);
    });

    test('should return MINIMAL_RISK when risk score < 8', () => {
      const input: AssessmentInput = {
        ...validInput,
        systemName: 'Email Filter',
        description: 'Simple email filtering system',
        riskSeverity: 1,
        riskLikelihood: 1,
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('MINIMAL_RISK');
      expect(result.riskScore).toBe(1);
    });
  });

  describe('GPAI Classification', () => {
    test('should classify as GPAI for large language models', () => {
      const input: AssessmentInput = {
        ...validInput,
        systemName: 'Large Language Model',
        description: 'General purpose language model',
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('GPAI');
      expect(result.confidenceScore).toBe(80);
    });

    test('should include GPAI obligations', () => {
      const input: AssessmentInput = {
        ...validInput,
        systemName: 'GPT System',
        description: 'General purpose AI',
      };
      const result = classifyAISystem(input);
      if (result.classification === 'GPAI') {
        expect(result.obligations.length).toBeGreaterThan(0);
        expect(result.applicableArticles).toContain('Article 53: GPAI Provider Obligations');
      }
    });
  });

  describe('Default Classification', () => {
    test('should return MINIMAL_RISK as default', () => {
      const input: AssessmentInput = {
        ...validInput,
        systemName: 'Email Spam Filter',
        description: 'Simple spam filtering system',
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('MINIMAL_RISK');
      expect(result.confidenceScore).toBe(50);
      expect(result.evidenceStrength).toBe(25);
    });

    test('should include reasoning in result', () => {
      const result = classifyAISystem(validInput);
      expect(result).toHaveProperty('reasoning');
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('Result Structure', () => {
    test('should return valid ClassificationResult structure', () => {
      const result = classifyAISystem(validInput);
      
      expect(result).toHaveProperty('classification');
      expect(result).toHaveProperty('confidenceScore');
      expect(result).toHaveProperty('evidenceStrength');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('annex1Matches');
      expect(result).toHaveProperty('annex3Matches');
      expect(result).toHaveProperty('applicableArticles');
      expect(result).toHaveProperty('obligations');
      expect(result).toHaveProperty('reasoning');

      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.annex1Matches)).toBe(true);
      expect(Array.isArray(result.annex3Matches)).toBe(true);
      expect(Array.isArray(result.applicableArticles)).toBe(true);
      expect(Array.isArray(result.obligations)).toBe(true);
    });

    test('should have valid confidence score range', () => {
      const result = classifyAISystem(validInput);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(100);
    });

    test('should have valid evidence strength range', () => {
      const result = classifyAISystem(validInput);
      expect(result.evidenceStrength).toBeGreaterThanOrEqual(0);
      expect(result.evidenceStrength).toBeLessThanOrEqual(100);
    });
  });

  describe('Rules Metadata', () => {
    test('should return rules metadata', () => {
      const metadata = getRulesMetadata();
      expect(metadata).toHaveProperty('version');
      expect(metadata).toHaveProperty('regulation');
      expect(metadata).toHaveProperty('source');
      expect(metadata).toHaveProperty('authority');
      expect(metadata).toHaveProperty('last_reviewed');
    });

    test('should return rules version', () => {
      const version = getRulesVersion();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined risk scores gracefully', () => {
      const input: AssessmentInput = {
        ...validInput,
        riskSeverity: undefined,
        riskLikelihood: undefined,
      };
      const result = classifyAISystem(input);
      expect(result).toHaveProperty('classification');
      expect(result.classification).toBe('MINIMAL_RISK');
    });

    test('should handle zero risk scores', () => {
      const input: AssessmentInput = {
        ...validInput,
        riskSeverity: 0,
        riskLikelihood: 0,
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('MINIMAL_RISK');
    });

    test('should be case-insensitive for trigger matching', () => {
      const input1: AssessmentInput = {
        ...validInput,
        systemName: 'FACIAL RECOGNITION',
        description: 'BIOMETRIC SYSTEM',
      };
      const result1 = classifyAISystem(input1);

      const input2: AssessmentInput = {
        ...validInput,
        systemName: 'facial recognition',
        description: 'biometric system',
      };
      const result2 = classifyAISystem(input2);

      expect(result1.classification).toBe(result2.classification);
    });
  });
});
