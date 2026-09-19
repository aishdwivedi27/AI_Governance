// __tests__/classification-engine.test.ts
import { classifyAISystem, getRulesMetadata, getRulesVersion, buildChecklistDrafts } from '../lib/classification-engine'
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
  role: ['provider'],
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

    test('should throw error if role array is empty', () => {
      const invalidInput = { ...validInput, role: [] };
      expect(() => classifyAISystem(invalidInput)).toThrow('Validation failed');
    });

    test('should throw error if role is missing', () => {
      const { role, ...rest } = validInput;
      expect(() => classifyAISystem(rest as AssessmentInput)).toThrow('Validation failed');
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

  describe('Article 6(3) Exemption', () => {
    const annexIIIInput: AssessmentInput = {
      ...validInput,
      systemName: 'Recruitment Screener',
      description: 'Automated recruitment platform for CV screening of job candidates',
    };

    test('should downgrade to LIMITED_RISK when an exemption condition is met and no significant risk of harm', () => {
      const input: AssessmentInput = {
        ...annexIIIInput,
        performsNarrowProceduralTask: true,
        significantRiskOfHarm: false,
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('LIMITED_RISK');
      expect(result.exemptionApplied).toBe(true);
      expect(result.obligations.some(o => o.toLowerCase().includes('document'))).toBe(true);
      expect(result.obligations.some(o => o.toLowerCase().includes('register'))).toBe(true);
    });

    test('should stay HIGH_RISK when an exemption condition is met but there is significant risk of harm', () => {
      const input: AssessmentInput = {
        ...annexIIIInput,
        performsNarrowProceduralTask: true,
        significantRiskOfHarm: true,
      };
      const result = classifyAISystem(input);
      expect(result.classification).toBe('HIGH_RISK');
      expect(result.exemptionApplied).toBe(false);
      expect(result.reasoning.toLowerCase()).toContain('rejected');
    });

    test('should stay HIGH_RISK when no exemption condition is met', () => {
      const result = classifyAISystem(annexIIIInput);
      expect(result.classification).toBe('HIGH_RISK');
      expect(result.exemptionApplied).toBe(false);
    });
  });

  describe('Role-Based Obligations', () => {
    const annexIIIInput: AssessmentInput = {
      ...validInput,
      systemName: 'Recruitment Screener',
      description: 'Automated recruitment platform for CV screening of job candidates',
    };

    test('should produce different obligations for provider vs deployer', () => {
      const providerResult = classifyAISystem({ ...annexIIIInput, role: ['provider'] });
      const deployerResult = classifyAISystem({ ...annexIIIInput, role: ['deployer'] });

      expect(providerResult.classification).toBe('HIGH_RISK');
      expect(deployerResult.classification).toBe('HIGH_RISK');
      expect(providerResult.obligations).not.toEqual(deployerResult.obligations);
    });

    test('should union obligations without duplicates for multiple roles', () => {
      const providerResult = classifyAISystem({ ...annexIIIInput, role: ['provider'] });
      const deployerResult = classifyAISystem({ ...annexIIIInput, role: ['deployer'] });
      const combinedResult = classifyAISystem({ ...annexIIIInput, role: ['provider', 'deployer'] });

      const expectedUnion = new Set([...providerResult.obligations, ...deployerResult.obligations]);
      expect(new Set(combinedResult.obligations)).toEqual(expectedUnion);
      expect(new Set(combinedResult.obligations).size).toBe(combinedResult.obligations.length);
    });
  });

  describe('Governance Requirements and Evidence Checklist', () => {
    const annexIIIInput: AssessmentInput = {
      ...validInput,
      systemName: 'Recruitment Screener',
      description: 'Automated recruitment platform for CV screening of job candidates',
    };

    test('derives one checklist item per obligation with parsed article and artifact', () => {
      const result = classifyAISystem({ ...annexIIIInput, role: ['provider'] });

      expect(result.checklist).toHaveLength(result.obligations.length);
      const art11 = result.checklist.find(i => i.obligationArticle === 'Article 11');
      expect(art11?.requiredArtifact).toBe('Technical documentation file');
    });

    test('uses the inner article for "Treated as Provider" obligations', () => {
      const result = classifyAISystem({ ...annexIIIInput, role: ['product_manufacturer'] });
      const art9 = result.checklist.find(i => i.title.includes('Article 9: Risk Management'));
      expect(art9?.obligationArticle).toBe('Article 9');
    });

    test('non-article obligations (e.g. minimal risk) fall back to General', () => {
      const drafts = buildChecklistDrafts(['Compliance with general EU law', 'Standard documentation']);
      expect(drafts).toHaveLength(2);
      expect(drafts.every(i => i.obligationArticle === 'General')).toBe(true);
      expect(drafts.every(i => i.requiredArtifact === 'Evidence of compliance')).toBe(true);
    });

    test('returns one governance requirement per role, scoped by classification', () => {
      const result = classifyAISystem({ ...annexIIIInput, role: ['provider', 'deployer'] });

      expect(result.classification).toBe('HIGH_RISK');
      expect(result.governanceRequirements.map(g => g.role)).toEqual(['provider', 'deployer']);
      for (const g of result.governanceRequirements) {
        expect(g.ownerRole).toBeTruthy();
        expect(g.reviewCadence).toBe('Quarterly');
        expect(g.escalationTrigger).toBeTruthy();
      }
    });
  });

  describe('GPAI Systemic Risk', () => {
    const gpaiInput: AssessmentInput = {
      ...validInput,
      systemName: 'Large Language Model',
      description: 'General purpose language model',
    };

    test('should classify as systemic risk when training compute meets the Article 51 threshold', () => {
      const result = classifyAISystem({ ...gpaiInput, gpaiTrainingComputeFLOPs: 2e25 });
      expect(result.classification).toBe('GPAI');
      expect(result.applicableArticles).toContain('Article 51: Systemic Risk Classification');
      expect(result.applicableArticles).toContain('Article 55: Systemic Risk Obligations');
    });

    test('should classify as systemic risk on Commission designation regardless of compute', () => {
      const result = classifyAISystem({ ...gpaiInput, gpaiSystemicRiskDesignation: true });
      expect(result.classification).toBe('GPAI');
      expect(result.applicableArticles).toContain('Article 51: Systemic Risk Classification');
    });

    test('should stay standard GPAI when below the compute threshold', () => {
      const result = classifyAISystem({ ...gpaiInput, gpaiTrainingComputeFLOPs: 1e20 });
      expect(result.classification).toBe('GPAI');
      expect(result.applicableArticles).not.toContain('Article 51: Systemic Risk Classification');
    });

    test('should stay standard GPAI when no systemic-risk fields are provided', () => {
      const result = classifyAISystem(gpaiInput);
      expect(result.classification).toBe('GPAI');
      expect(result.applicableArticles).not.toContain('Article 51: Systemic Risk Classification');
    });
  });

  describe('Combined Annex III + Article 50 Matching', () => {
    test('should return a single HIGH_RISK result combining Annex III and Article 50 obligations', () => {
      const input: AssessmentInput = {
        ...validInput,
        systemName: 'Recruitment Chatbot',
        description: 'AI recruitment chatbot for screening job candidates',
      };
      const result = classifyAISystem(input);

      expect(result.classification).toBe('HIGH_RISK');
      expect(result.applicableArticles).toContain('Article 9-16: High-Risk Obligations');
      expect(result.applicableArticles).toContain('Article 50: Transparency Obligations');
      expect(result.obligations.some(o => o.includes('Article 9'))).toBe(true);
      expect(result.obligations.some(o => o.includes('Article 50'))).toBe(true);
    });
  });
});
