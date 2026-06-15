// lib/classification-engine.ts
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

let cachedRules: any = null;

function loadRules() {
  if (cachedRules) return cachedRules;
  
  // Try multiple paths to support both compiled and test environments
  const possiblePaths = [
    path.join(__dirname, '..', 'data', 'rules.yaml'),      // For compiled code: dist/lib/../data
    path.join(process.cwd(), 'data', 'rules.yaml'),        // For tests/dev: project root/data
    path.join(__dirname, '..', '..', 'data', 'rules.yaml') // Fallback nested path
  ];
  
  let rulesPath = '';
  let foundPath = false;
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      rulesPath = p;
      foundPath = true;
      break;
    }
  }
  
  if (!foundPath) {
    throw new Error(`Rules file not found. Tried: ${possiblePaths.join(', ')}`);
  }
  
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
  
  if (!rulesContent || rulesContent.trim().length === 0) {
    throw new Error('Rules file is empty');
  }
  
  cachedRules = YAML.parse(rulesContent);
  
  if (!cachedRules || typeof cachedRules !== 'object') {
    throw new Error('Rules file is invalid YAML');
  }
  
  return cachedRules;
}

export interface AssessmentInput {
  systemName: string;
  description: string;
  industry: string;
  geographies: string[];
  vulnerableGroups: string[];
  fundamentalRightsImpact: boolean;
  crossBorderImpact: boolean;
  riskSeverity?: number;
  riskLikelihood?: number;
}

export type RiskClassification = 'UNACCEPTABLE_RISK' | 'HIGH_RISK' | 'LIMITED_RISK' | 'GPAI' | 'MINIMAL_RISK';

export interface Violation {
  id: string;
  name: string;
  article: string;
  description: string;
}

export interface AnnexMatch {
  example?: string;
  id?: string;
  name?: string;
  examples?: string[];
}

export interface ClassificationResult {
  classification: RiskClassification;
  confidenceScore: number;
  evidenceStrength: number;
  violations: Violation[];
  annex1Matches: AnnexMatch[];
  annex3Matches: AnnexMatch[];
  applicableArticles: string[];
  obligations: string[];
  riskScore?: number;
  reasoning: string;
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,      // insertion
        matrix[j - 1][i] + 1,      // deletion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }

  return matrix[len2][len1];
}

// Check if word contains trigger with fuzzy matching (allows typos)
function wordContainsTriggerFuzzy(word: string, trigger: string, maxDistance: number = 3): boolean {
  const normalized = normalizeText(word);
  const normalizedTrigger = normalizeText(trigger);

  // Exact match first (fastest)
  if (normalized.includes(normalizedTrigger)) return true;

  // Split into words and check each word/phrase
  const words = normalized.split(/\s+/);
  const triggerWords = normalizedTrigger.split(/\s+/);

  // For single-word triggers, check fuzzy match against all words
  if (triggerWords.length === 1) {
    for (const word of words) {
      const distance = levenshteinDistance(word, normalizedTrigger);
      const similarity = 1 - (distance / Math.max(word.length, normalizedTrigger.length));
      if (similarity >= 0.8 || distance <= maxDistance) {
        return true;
      }
    }
  }

  // For multi-word triggers, check if all trigger words appear (fuzzy)
  let matchedWords = 0;
  for (const triggerWord of triggerWords) {
    for (const word of words) {
      const distance = levenshteinDistance(word, triggerWord);
      if (distance <= maxDistance || (1 - (distance / Math.max(word.length, triggerWord.length))) >= 0.8) {
        matchedWords++;
        break;
      }
    }
  }

  return matchedWords === triggerWords.length;
}

function textContainsTrigger(text: string, trigger: string): boolean {
  return wordContainsTriggerFuzzy(text, trigger);
}

export function classifyAISystem(input: AssessmentInput): ClassificationResult {
  // Basic validation
  if (!input.systemName?.trim()) {
    throw new Error('Validation failed: System name is required');
  }
  if (!input.description?.trim()) {
    throw new Error('Validation failed: Description is required');
  }
  if (!input.industry?.trim()) {
    throw new Error('Validation failed: Industry is required');
  }
  if (!Array.isArray(input.geographies) || input.geographies.length === 0) {
    throw new Error('Validation failed: At least one geography must be selected');
  }

  const rules = loadRules();
  const combinedText = `${input.systemName} ${input.description} ${input.industry}`;

  // STEP 1: Article 5 - Prohibited Practices
  const violations: Violation[] = [];
  const article5 = rules.article_5;
  
  if (article5?.prohibited_practices) {
    for (const prohibition of article5.prohibited_practices) {
      if (!prohibition.triggers || !Array.isArray(prohibition.triggers)) continue;
      
      const isTriggered = prohibition.triggers.some((trigger: string) =>
        textContainsTrigger(combinedText, trigger)
      );

      if (isTriggered) {
        violations.push({
          id: prohibition.id,
          name: prohibition.name,
          article: prohibition.article,
          description: prohibition.description,
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      classification: 'UNACCEPTABLE_RISK',
      confidenceScore: 95,
      evidenceStrength: 100,
      violations,
      annex1Matches: [],
      annex3Matches: [],
      applicableArticles: ['Article 5: Prohibited AI Practices'],
      obligations: [],
      reasoning: `UNACCEPTABLE RISK: System violates Article 5 prohibited practices: ${violations.map(v => v.name).join(', ')}. Deployment is prohibited.`,
    };
  }

  // STEP 2: Annex I - Safety Components
  const annex1Matches: AnnexMatch[] = [];
  const annexI = rules.annex_i;
  
  if (annexI?.triggers && Array.isArray(annexI.triggers)) {
    for (const trigger of annexI.triggers) {
      if (textContainsTrigger(combinedText, trigger)) {
        annex1Matches.push({ example: trigger });
      }
    }
  }

  if (annex1Matches.length > 0) {
    return {
      classification: 'HIGH_RISK',
      confidenceScore: 90,
      evidenceStrength: 90,
      violations: [],
      annex1Matches,
      annex3Matches: [],
      applicableArticles: ['Article 6: Classification', 'Article 9-16: High-Risk Obligations'],
      obligations: [
        'Article 9: Risk Management System',
        'Article 10: Data Governance',
        'Article 11: Technical Documentation',
        'Article 12: Logging',
        'Article 13: Transparency',
        'Article 14: Human Oversight',
        'Article 15: Accuracy & Robustness',
        'Article 16: Quality Management',
      ],
      reasoning: `HIGH RISK (Annex I): System is a safety component of regulated products. Full compliance obligations apply.`,
    };
  }

  // STEP 3: Annex III - High-Risk Categories
  const annex3Matches: AnnexMatch[] = [];
  const annexIII = rules.annex_iii;
  
  if (annexIII?.categories && Array.isArray(annexIII.categories)) {
    for (const category of annexIII.categories) {
      if (!category.triggers || !Array.isArray(category.triggers)) continue;
      
      const isCategoryMatch = category.triggers.some((trigger: string) =>
        textContainsTrigger(combinedText, trigger)
      );

      if (isCategoryMatch) {
        annex3Matches.push({
          id: category.id,
          name: category.name,
          examples: category.examples,
        });
      }
    }
  }

  if (annex3Matches.length > 0) {
    return {
      classification: 'HIGH_RISK',
      confidenceScore: 90,
      evidenceStrength: 90,
      violations: [],
      annex1Matches: [],
      annex3Matches,
      applicableArticles: ['Article 6: Classification', 'Article 9-16: High-Risk Obligations'],
      obligations: [
        'Article 9: Risk Management System',
        'Article 10: Data Governance',
        'Article 11: Technical Documentation',
        'Article 12: Logging',
        'Article 13: Transparency',
        'Article 14: Human Oversight',
        'Article 15: Accuracy & Robustness',
        'Article 16: Quality Management',
      ],
      reasoning: `HIGH RISK (Annex III): System matches ${annex3Matches.length} high-risk category(ies): ${annex3Matches.map(m => m.name).join(', ')}. Full compliance obligations apply.`,
    };
  }

  // STEP 4: Article 50 - Transparency
  const article50 = rules.article_50;
  if (article50?.triggers && Array.isArray(article50.triggers)) {
    for (const trigger of article50.triggers) {
      if (textContainsTrigger(combinedText, trigger)) {
        return {
          classification: 'LIMITED_RISK',
          confidenceScore: 75,
          evidenceStrength: 75,
          violations: [],
          annex1Matches: [],
          annex3Matches: [],
          applicableArticles: ['Article 50: Transparency Obligations'],
          obligations: [
            'Disclosure that output is AI-generated',
            'Clear identification of synthetic content',
            'Transparency to deployer',
          ],
          reasoning: `LIMITED RISK: System has transparency obligations under Article 50. Users must be informed that content is AI-generated.`,
        };
      }
    }
  }

  // STEP 5: GPAI Check
  if (textContainsTrigger(combinedText, 'general purpose') || textContainsTrigger(combinedText, 'large language')) {
    return {
      classification: 'GPAI',
      confidenceScore: 80,
      evidenceStrength: 80,
      violations: [],
      annex1Matches: [],
      annex3Matches: [],
      applicableArticles: ['Article 3(1): GPAI Definition', 'Article 53: GPAI Provider Obligations'],
      obligations: [
        'Technical Documentation',
        'Copyright Protection Policy',
        'Transparency Requirements',
        'Systemic Risk Assessment',
      ],
      reasoning: `GPAI: System qualifies as General Purpose AI. Provider obligations under Article 53 apply.`,
    };
  }

  // STEP 6: Risk Scoring (Fallback)
  if (input.riskSeverity !== undefined && input.riskLikelihood !== undefined) {
    const riskScore = input.riskSeverity * input.riskLikelihood;

    if (riskScore >= 20) {
      return {
        classification: 'HIGH_RISK',
        confidenceScore: 70,
        evidenceStrength: 60,
        violations: [],
        annex1Matches: [],
        annex3Matches: [],
        applicableArticles: ['Article 6: Classification', 'Article 9-16: High-Risk Obligations'],
        obligations: [
          'Risk Management System',
          'Data Governance',
          'Technical Documentation',
          'Human Oversight',
        ],
        riskScore,
        reasoning: `HIGH RISK (Organizational Assessment): Risk score ${riskScore}/25 indicates high organizational risk.`,
      };
    } else if (riskScore >= 8) {
      return {
        classification: 'LIMITED_RISK',
        confidenceScore: 65,
        evidenceStrength: 50,
        violations: [],
        annex1Matches: [],
        annex3Matches: [],
        applicableArticles: ['Article 50: Limited Risk Requirements'],
        obligations: [
          'Transparency to users',
          'Documentation',
          'Monitoring',
        ],
        riskScore,
        reasoning: `LIMITED RISK (Organizational Assessment): Risk score ${riskScore}/25 indicates limited organizational risk.`,
      };
    }
  }

  // STEP 7: Default - Minimal Risk
  const riskScore = (input.riskSeverity !== undefined && input.riskLikelihood !== undefined)
    ? input.riskSeverity * input.riskLikelihood
    : undefined;

  const result: ClassificationResult = {
    classification: 'MINIMAL_RISK',
    confidenceScore: 50,
    evidenceStrength: 25,
    violations: [],
    annex1Matches: [],
    annex3Matches: [],
    applicableArticles: ['Article 4: General Provisions'],
    obligations: [
      'Compliance with general EU law',
      'Standard documentation',
    ],
    reasoning: `MINIMAL RISK: No high-risk indicators identified. Standard compliance obligations apply.`,
  };

  if (riskScore !== undefined) {
    result.riskScore = riskScore;
  }

  return result;
}

export function getRulesMetadata() {
  const rules = loadRules();
  return {
    version: rules.metadata?.version || '3.0.0',
    regulation: rules.metadata?.regulation || 'Regulation (EU) 2024/1689',
    source: rules.metadata?.source || 'EUR-Lex',
    authority: rules.metadata?.authority || 'European Commission',
    last_reviewed: rules.metadata?.last_reviewed || '2026-06-11',
  };
}

export function getRulesVersion(): string {
  const rules = loadRules();
  return rules.metadata?.version || '3.0.0';
}