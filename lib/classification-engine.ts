// lib/classification-engine.ts
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { normalizeText, textContainsTrigger } from './text-match';
import {
  EXEMPTION_KEYS,
  PRODUCT_TYPE_IDS,
  TRI_STATES,
  getActiveAnnex3Categories,
  getAnswer,
  getChallengedAnswers,
  getScreeningQuestions,
} from './assessment-flow';
import { AUSTRALIA_QUESTION_KEYS } from './australia-alignment';
import type {
  ChallengedAnswer,
  ExemptionKey,
  ProductType,
  ScreeningQuestion,
  TriState,
  WizardAnswers,
  WizardRules,
} from './assessment-flow';

export type { ExemptionKey, ProductType, TriState, WizardRules };

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

export type Role = 'provider' | 'deployer' | 'importer' | 'distributor' | 'product_manufacturer';

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

  // Who is being assessed - drives role-scoped obligations
  role: Role[];

  // Article 6(3) exemption inputs - optional, undefined/false = no exemption
  performsNarrowProceduralTask?: boolean;
  improvesCompletedHumanActivity?: boolean;
  detectsPatternsWithoutInfluencingDecisions?: boolean;
  performsPreparatoryWork?: boolean;
  significantRiskOfHarm?: boolean;

  // GPAI systemic risk inputs - only meaningful when GPAI triggers
  gpaiTrainingComputeFLOPs?: number;
  gpaiSystemicRiskDesignation?: boolean;

  // Structured wizard answers. When present, each is authoritative for its step and the
  // keyword matching for that step is skipped; when absent the keyword logic runs unchanged.
  // 'unsure' is resolved pessimistically (see buildUncertainty).
  productType?: ProductType;
  article5Answers?: Record<string, TriState>;
  annex1Answer?: TriState;
  annex3Answers?: Record<string, TriState>;
  exemptionAnswers?: Partial<Record<ExemptionKey, TriState>>;
  // Written reasons for "No" answers that other evidence contradicts, keyed by question id
  justifications?: Record<string, string>;
  generatesOrInteractsWithPeople?: boolean;
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

export type ChecklistStatus = 'not_started' | 'in_progress' | 'complete' | 'not_applicable';

export const CHECKLIST_STATUSES: readonly ChecklistStatus[] = [
  'not_started',
  'in_progress',
  'complete',
  'not_applicable',
];

export interface GovernanceRequirement {
  role: Role;
  ownerRole: string;
  reviewCadence: string;
  escalationTrigger: string;
}

export interface EvidenceChecklistItem {
  id: string;
  obligationArticle: string;
  title: string;
  description: string;
  requiredArtifact: string;
  status: ChecklistStatus;
  owner: string | null;
  evidenceLink: string | null;
  lastUpdated: string;
}

// What the engine derives; id/status/owner/evidenceLink/lastUpdated are set on persistence
export type EvidenceChecklistItemDraft = Omit<
  EvidenceChecklistItem,
  'id' | 'status' | 'owner' | 'evidenceLink' | 'lastUpdated'
>;

export interface UncertaintyItem {
  questionId: string;
  label: string;
  treatedAs: string;
}

export interface Uncertainty {
  unsureQuestions: UncertaintyItem[];
  challengedAnswers: ChallengedAnswer[];
  worstCaseClassification: RiskClassification;
  note: string;
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
  exemptionApplied?: boolean;
  uncertainty?: Uncertainty;
  governanceRequirements: GovernanceRequirement[];
  checklist: EvidenceChecklistItemDraft[];
}


type ObligationTier = 'HIGH_RISK' | 'LIMITED_RISK' | 'GPAI' | 'GPAI_SYSTEMIC';

const ROLE_OBLIGATIONS: Record<ObligationTier, Record<Role, string[]>> = {
  HIGH_RISK: {
    provider: [
      'Article 9: Risk Management System',
      'Article 10: Data Governance',
      'Article 11: Technical Documentation',
      'Article 12: Logging',
      'Article 13: Transparency',
      'Article 14: Human Oversight',
      'Article 15: Accuracy & Robustness',
      'Article 16: Quality Management System',
    ],
    deployer: [
      'Article 14: Assign Human Oversight',
      'Article 26: Use System per Provider Instructions',
      'Article 26: Monitor Operation and Retain Logs',
      'Article 26: Inform Affected Workers and Representatives',
      'Article 26: Conduct Fundamental Rights Impact Assessment (where applicable)',
    ],
    importer: [
      'Article 23: Verify Provider Conformity Assessment',
      'Article 23: Verify CE Marking and Documentation',
      'Article 23: Ensure Storage/Transport Preserves Conformity',
    ],
    distributor: [
      'Article 24: Verify CE Marking Before Market Placement',
      'Article 24: Verify Required Documentation Present',
      'Article 24: Cooperate with Corrective Actions and Withdrawals',
    ],
    product_manufacturer: [
      'Article 25(3): Treated as Provider - Article 9: Risk Management System',
      'Article 25(3): Treated as Provider - Article 10: Data Governance',
      'Article 25(3): Treated as Provider - Article 11: Technical Documentation',
      'Article 25(3): Treated as Provider - Article 12: Logging',
      'Article 25(3): Treated as Provider - Article 13: Transparency',
      'Article 25(3): Treated as Provider - Article 14: Human Oversight',
      'Article 25(3): Treated as Provider - Article 15: Accuracy & Robustness',
      'Article 25(3): Treated as Provider - Article 16: Quality Management System',
    ],
  },
  LIMITED_RISK: {
    provider: [
      'Article 50(1): Design System to Enable AI-Disclosure',
      'Article 50(2): Mark Synthetic Audio/Image/Video/Text as AI-Generated',
    ],
    deployer: [
      'Article 50(3): Inform Natural Persons of Emotion Recognition/Biometric Categorisation',
      'Article 50(4): Disclose AI-Generated or Manipulated Content to Users',
    ],
    importer: ['Article 50: Verify Transparency Measures Are Present'],
    distributor: ['Article 50: Verify Transparency Measures Are Present'],
    product_manufacturer: ['Article 50: Verify Transparency Measures Are Present'],
  },
  GPAI: {
    provider: [
      'Article 53: Maintain Technical Documentation',
      'Article 53: Copyright Policy Compliance',
      'Article 53: Provide Information to Downstream Providers',
      'Article 53: Transparency Requirements',
    ],
    deployer: [
      'Article 50: Downstream Transparency to End Users',
      'Article 26: Use per Provider Instructions',
    ],
    importer: ['Article 53: Verify Provider GPAI Compliance Documentation'],
    distributor: ['Article 53: Verify Provider GPAI Compliance Documentation'],
    product_manufacturer: ['Article 53: Verify Provider GPAI Compliance Documentation'],
  },
  GPAI_SYSTEMIC: {
    provider: [
      'Article 53: Maintain Technical Documentation',
      'Article 53: Copyright Policy Compliance',
      'Article 53: Provide Information to Downstream Providers',
      'Article 53: Transparency Requirements',
      'Article 55: Perform Model Evaluation and Adversarial Testing',
      'Article 55: Assess and Mitigate Systemic Risk',
      'Article 55: Report Serious Incidents to the AI Office',
      'Article 55: Ensure Adequate Cybersecurity Protection',
    ],
    deployer: [
      'Article 50: Downstream Transparency to End Users',
      'Article 26: Use per Provider Instructions',
      'Article 55: Monitor Provider Systemic Risk Mitigation Measures',
    ],
    importer: [
      'Article 53: Verify Provider GPAI Compliance Documentation',
      'Article 55: Monitor Provider Systemic Risk Mitigation Measures',
    ],
    distributor: [
      'Article 53: Verify Provider GPAI Compliance Documentation',
      'Article 55: Monitor Provider Systemic Risk Mitigation Measures',
    ],
    product_manufacturer: [
      'Article 53: Verify Provider GPAI Compliance Documentation',
      'Article 55: Monitor Provider Systemic Risk Mitigation Measures',
    ],
  },
};

function getObligationsForRoles(tier: ObligationTier, roles: Role[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const role of roles) {
    const obligations = ROLE_OBLIGATIONS[tier]?.[role] ?? [];
    for (const obligation of obligations) {
      if (!seen.has(obligation)) {
        seen.add(obligation);
        result.push(obligation);
      }
    }
  }
  return result;
}

const GOVERNANCE_BY_ROLE: Record<Role, Omit<GovernanceRequirement, 'role'>> = {
  provider: {
    ownerRole: 'Head of AI Compliance',
    reviewCadence: 'Quarterly',
    escalationTrigger: 'Any serious incident, substantial modification, or failed conformity check',
  },
  deployer: {
    ownerRole: 'Business System Owner',
    reviewCadence: 'Quarterly',
    escalationTrigger: 'Operation outside provider instructions, or an incident affecting individuals',
  },
  importer: {
    ownerRole: 'Regulatory Affairs Lead',
    reviewCadence: 'Per shipment and annually',
    escalationTrigger: 'Missing CE marking or documentation, or suspected non-conformity',
  },
  distributor: {
    ownerRole: 'Regulatory Affairs Lead',
    reviewCadence: 'Per shipment and annually',
    escalationTrigger: 'Missing CE marking or documentation, or suspected non-conformity',
  },
  product_manufacturer: {
    ownerRole: 'Head of Product Compliance',
    reviewCadence: 'Quarterly',
    escalationTrigger: 'Any serious incident or change to the AI component of the product',
  },
};

// Stricter cadence/escalation by classification; minimal-risk needs only light review.
const GOVERNANCE_BY_CLASSIFICATION: Record<
  RiskClassification,
  { reviewCadence?: string; escalationTrigger?: string }
> = {
  UNACCEPTABLE_RISK: {
    reviewCadence: 'Immediate',
    escalationTrigger: 'Any use or deployment of the system - prohibited under Article 5',
  },
  HIGH_RISK: { reviewCadence: 'Quarterly' },
  GPAI: { reviewCadence: 'Quarterly' },
  LIMITED_RISK: { reviewCadence: 'Semi-annually' },
  MINIMAL_RISK: {
    reviewCadence: 'Annually',
    escalationTrigger: 'Change in intended purpose that could alter the classification',
  },
};

export function getGovernanceRequirements(
  classification: RiskClassification,
  roles: Role[]
): GovernanceRequirement[] {
  const overrides = GOVERNANCE_BY_CLASSIFICATION[classification];
  return roles.map(role => ({ role, ...GOVERNANCE_BY_ROLE[role], ...overrides }));
}

const ARTIFACT_BY_ARTICLE: Record<string, string> = {
  '9': 'Risk management file',
  '10': 'Data governance and data quality records',
  '11': 'Technical documentation file',
  '12': 'Logging specification and sample logs',
  '13': 'Instructions for use',
  '14': 'Human oversight procedure',
  '15': 'Accuracy and robustness test report',
  '16': 'Quality management system documentation',
  '23': 'Importer verification record',
  '24': 'Distributor verification record',
  '26': 'Deployer operating procedure and monitoring logs',
  '50': 'Transparency notice or AI-disclosure evidence',
  '53': 'GPAI technical documentation and copyright policy',
  '55': 'Systemic risk evaluation and mitigation report',
};

const DEFAULT_ARTIFACT = 'Evidence of compliance';

// "Article 25(3): Treated as Provider - Article 9: Risk Management System" -> inner article 9
// "Article 26: Monitor Operation and Retain Logs" -> article 26
// Anything without an "Article" prefix -> 'General'
export function parseObligation(obligation: string): { article: string; number: string | null } {
  const matches = Array.from(obligation.matchAll(/Article (\d+(?:\([0-9a-z]+\))?)/g));
  if (matches.length === 0) return { article: 'General', number: null };
  const last = matches[matches.length - 1];
  return { article: `Article ${last[1]}`, number: last[1].replace(/\(.*\)$/, '') };
}

export function buildChecklistDrafts(obligations: string[]): EvidenceChecklistItemDraft[] {
  return obligations.map(obligation => {
    const { article, number } = parseObligation(obligation);
    return {
      obligationArticle: article,
      title: obligation,
      description: `Provide evidence that this obligation is met: ${obligation}`,
      requiredArtifact: (number && ARTIFACT_BY_ARTICLE[number]) || DEFAULT_ARTIFACT,
    };
  });
}

type CoreResult = Omit<ClassificationResult, 'governanceRequirements' | 'checklist'>;

const SEVERITY: Record<RiskClassification, number> = {
  MINIMAL_RISK: 0,
  LIMITED_RISK: 1,
  GPAI: 1,
  HIGH_RISK: 2,
  UNACCEPTABLE_RISK: 3,
};

function treatedAs(q: ScreeningQuestion): string {
  if (q.id.startsWith('article5.')) {
    return 'Not treated as a violation, but a prohibited practice cannot be ruled out. Legal review is required before any deployment.';
  }
  if (q.id === 'annex1') return 'Treated as a safety component of a regulated product (high risk).';
  if (q.id.startsWith('annex3.')) return 'Treated as applicable, so the system is presumed high-risk.';
  if (q.id === 'exemption.significantRiskOfHarm') {
    return 'Treated as a significant risk of harm, so the Article 6(3) exemption does not apply.';
  }
  return 'Treated as not met, so the Article 6(3) exemption is not assumed.';
}

function buildUncertainty(
  input: AssessmentInput,
  classification: RiskClassification,
  rules: WizardRules
): Uncertainty | undefined {
  const answers = input as WizardAnswers;
  const annex3Active = getActiveAnnex3Categories(answers).length > 0;

  const unsure = getScreeningQuestions(rules)
    .filter(q => getAnswer(answers, q.id) === 'unsure')
    // Exemption answers are only relevant when an Annex III area applies
    .filter(q => !q.id.startsWith('exemption.') || annex3Active);
  const challenged = getChallengedAnswers(answers, rules);
  if (unsure.length === 0 && challenged.length === 0) return undefined;

  let worst = classification;
  const consider = (questionId: string) => {
    const target: RiskClassification = questionId.startsWith('article5.') ? 'UNACCEPTABLE_RISK' : 'HIGH_RISK';
    if (SEVERITY[target] > SEVERITY[worst]) worst = target;
  };
  unsure.forEach(q => consider(q.id));
  challenged.forEach(c => consider(c.questionId));

  const parts: string[] = [];
  if (unsure.length) {
    parts.push(
      `${unsure.length} answer${unsure.length > 1 ? 's were' : ' was'} "unsure" and treated pessimistically.`
    );
  }
  if (challenged.length) {
    parts.push(
      `${challenged.length} "No" answer${challenged.length > 1 ? 's conflict' : ' conflicts'} with other information you provided; the answer${challenged.length > 1 ? 's were' : ' was'} kept but must be evidenced.`
    );
  }
  parts.push(`Worst case if these resolve against you: ${worst.replace(/_/g, ' ')}.`);

  return {
    unsureQuestions: unsure.map(q => ({ questionId: q.id, label: q.label, treatedAs: treatedAs(q) })),
    challengedAnswers: challenged,
    worstCaseClassification: worst,
    note: parts.join(' '),
  };
}

/** Re-derive the uncertainty block for a stored record (answers are stored; the block is not). */
export function computeUncertainty(
  answers: WizardAnswers,
  classification: RiskClassification
): Uncertainty | undefined {
  if (classification === 'UNACCEPTABLE_RISK') return undefined;
  return buildUncertainty(answers as AssessmentInput, classification, getWizardRules());
}

function uncertaintyChecklist(u: Uncertainty, rules: WizardRules): EvidenceChecklistItemDraft[] {
  const articleOf = (id: string) => getScreeningQuestions(rules).find(q => q.id === id)?.article ?? 'General';
  return [
    ...u.unsureQuestions.map(item => ({
      obligationArticle: articleOf(item.questionId),
      title: `Resolve: ${item.label}`,
      description: `The answer was "unsure" and has been treated pessimistically. Determine the correct answer and record it. ${item.treatedAs}`,
      requiredArtifact: 'Documented determination with supporting evidence',
    })),
    ...u.challengedAnswers.map(c => ({
      obligationArticle: articleOf(c.questionId),
      title: `Document evidence supporting "No": ${c.label}`,
      description: `The answer "No" conflicts with: ${c.signals.join(' ')} ${c.justification ? `Justification given: ${c.justification}` : 'No justification was recorded.'}`,
      requiredArtifact: 'Written justification with supporting evidence',
    })),
  ];
}

export function classifyAISystem(input: AssessmentInput): ClassificationResult {
  const core = classifyCore(input);
  const rules = getWizardRules();
  const uncertainty =
    core.classification === 'UNACCEPTABLE_RISK' ? undefined : buildUncertainty(input, core.classification, rules);

  const checklist = buildChecklistDrafts(core.obligations);
  let confidenceScore = core.confidenceScore;
  if (uncertainty) {
    checklist.push(...uncertaintyChecklist(uncertainty, rules));
    confidenceScore = Math.max(
      30,
      confidenceScore - 10 * uncertainty.unsureQuestions.length - 5 * uncertainty.challengedAnswers.length
    );
  }

  return {
    ...core,
    confidenceScore,
    ...(uncertainty && { uncertainty }),
    governanceRequirements: getGovernanceRequirements(core.classification, input.role),
    checklist,
  };
}

function validateStructuredInput(input: AssessmentInput): void {
  const rules = getWizardRules();
  const fail = (msg: string): never => {
    throw new Error(`Validation failed: ${msg}`);
  };
  const isTri = (v: unknown) => TRI_STATES.includes(v as TriState);
  const checkMap = (name: string, value: unknown, allowedIds: string[]) => {
    if (value === undefined) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!allowedIds.includes(k)) fail(`${name} has unknown key "${k}"`);
      if (!isTri(v)) fail(`${name}.${k} must be yes, no or unsure`);
    }
  };

  if (input.productType !== undefined && !PRODUCT_TYPE_IDS.includes(input.productType)) {
    fail(`unknown productType "${input.productType}"`);
  }
  checkMap('article5Answers', input.article5Answers, rules.article5.map(p => p.id));
  checkMap('annex3Answers', input.annex3Answers, rules.annexIII.map(c => c.id));
  checkMap('exemptionAnswers', input.exemptionAnswers, [...EXEMPTION_KEYS]);
  checkMap('australiaAnswers', (input as WizardAnswers).australiaAnswers, AUSTRALIA_QUESTION_KEYS);
  if (input.annex1Answer !== undefined && !isTri(input.annex1Answer)) fail('annex1Answer must be yes, no or unsure');
  if (input.justifications !== undefined) {
    if (typeof input.justifications !== 'object' || input.justifications === null) fail('justifications must be an object');
    for (const v of Object.values(input.justifications)) {
      if (typeof v !== 'string') fail('justifications values must be strings');
    }
  }
}

export function getWizardRules(): WizardRules {
  const rules = loadRules();
  return {
    article5: (rules.article_5?.prohibited_practices ?? []).map((p: any) => ({
      id: p.id,
      article: p.article,
      name: p.name,
      description: p.description,
      triggers: p.triggers ?? [],
    })),
    annexI: { examples: rules.annex_i?.examples ?? [], triggers: rules.annex_i?.triggers ?? [] },
    annexIII: (rules.annex_iii?.categories ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      examples: c.examples ?? [],
      triggers: c.triggers ?? [],
    })),
    exemptionConditions: (rules.article_6_3_exemption?.exemption_conditions ?? []).map((c: any) => ({
      id: c.id,
      description: c.description,
    })),
  };
}

function classifyCore(input: AssessmentInput): CoreResult {
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
  if (!Array.isArray(input.role) || input.role.length === 0) {
    throw new Error('Validation failed: At least one role must be selected');
  }

  validateStructuredInput(input);

  const rules = loadRules();
  const combinedText = `${input.systemName} ${input.description} ${input.industry}`;

  // STEP 1: Article 5 - Prohibited Practices (EXACT MATCH ONLY - no fuzzy)
    const violations: Violation[] = [];
    const article5 = rules.article_5;

    if (input.article5Answers) {
      for (const prohibition of article5?.prohibited_practices ?? []) {
        if (input.article5Answers[prohibition.id] === 'yes') {
          violations.push({
            id: prohibition.id,
            name: prohibition.name,
            article: prohibition.article,
            description: prohibition.description,
          });
        }
      }
    } else if (article5?.prohibited_practices) {
      for (const prohibition of article5.prohibited_practices) {
        if (!prohibition.triggers || !Array.isArray(prohibition.triggers)) continue;
        
        const isTriggered = prohibition.triggers.some((trigger: string) =>
          normalizeText(combinedText).includes(normalizeText(trigger))  // EXACT MATCH ONLY
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
  
  if (input.annex1Answer !== undefined) {
    if (input.annex1Answer === 'yes') {
      annex1Matches.push({ example: 'Safety component of a regulated product (confirmed)' });
    } else if (input.annex1Answer === 'unsure') {
      annex1Matches.push({ example: 'Possible safety component of a regulated product (unconfirmed, treated as matched)' });
    }
  } else if (annexI?.triggers && Array.isArray(annexI.triggers)) {
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
      obligations: getObligationsForRoles('HIGH_RISK', input.role),
      reasoning: `HIGH RISK (Annex I): System is a safety component of regulated products. Full compliance obligations apply.`,
    };
  }

  // Article 50 matches are computed here so STEP 3 can merge them into an Annex III
  // result when both genuinely apply, instead of only being reachable standalone.
  const article50 = rules.article_50;
  const article50Matches: string[] = [];
  if (input.generatesOrInteractsWithPeople !== undefined) {
    if (input.generatesOrInteractsWithPeople) article50Matches.push('user-confirmed transparency scenario');
  } else if (article50?.triggers && Array.isArray(article50.triggers)) {
    for (const trigger of article50.triggers) {
      if (textContainsTrigger(combinedText, trigger)) {
        article50Matches.push(trigger);
      }
    }
  }

  // STEP 3: Annex III - High-Risk Categories
  const annex3Matches: AnnexMatch[] = [];
  const annexIII = rules.annex_iii;

  if (input.annex3Answers) {
    for (const category of annexIII?.categories ?? []) {
      const answer = input.annex3Answers[category.id];
      if (answer === 'yes' || answer === 'unsure') {
        annex3Matches.push({ id: category.id, name: category.name, examples: category.examples });
      }
    }
  } else if (annexIII?.categories && Array.isArray(annexIII.categories)) {
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
    // Article 6(3) exemption assessment
    const ex = input.exemptionAnswers;
    const exemptionConditionMet = ex
      ? (['procedural_task', 'improve_completed_human_activity', 'pattern_detection', 'preparatory_task'] as const).some(
          k => ex[k] === 'yes'
        )
      : !!input.performsNarrowProceduralTask ||
        !!input.improvesCompletedHumanActivity ||
        !!input.detectsPatternsWithoutInfluencingDecisions ||
        !!input.performsPreparatoryWork;
    // Unsure about risk of harm is pessimistic: assume there is one.
    const significantRisk = ex
      ? ex.significantRiskOfHarm === 'yes' || ex.significantRiskOfHarm === 'unsure'
      : !!input.significantRiskOfHarm;
    // An Annex III area the user was unsure about can't be exempted from.
    const unsureCategory = annex3Matches.some(m => input.annex3Answers?.[m.id!] === 'unsure');
    const exemptionApplies = exemptionConditionMet && !significantRisk && !unsureCategory;

    if (exemptionApplies) {
      return {
        classification: 'LIMITED_RISK',
        confidenceScore: 70,
        evidenceStrength: 70,
        violations: [],
        annex1Matches: [],
        annex3Matches,
        applicableArticles: ['Article 6(3): High-Risk Exemption', 'Article 6(4): Exemption Documentation'],
        obligations: [
          'Document the exemption assessment and reasoning',
          'Register the exemption in the EU database per Article 49(2)',
          'Retain evidence supporting the exemption for market surveillance authorities',
        ],
        exemptionApplied: true,
        reasoning: `LIMITED RISK (Article 6(3) Exemption): System matches ${annex3Matches.length} Annex III high-risk category(ies) (${annex3Matches.map(m => m.name).join(', ')}) but qualifies for the Article 6(3) exemption, as it does not pose a significant risk of harm. Article 6(4) documentation and registration obligations apply instead of full high-risk obligations.`,
      };
    }

    let reasoning = `HIGH RISK (Annex III): System matches ${annex3Matches.length} high-risk category(ies): ${annex3Matches.map(m => m.name).join(', ')}. Full compliance obligations apply.`;
    if (exemptionConditionMet && significantRisk) {
      reasoning += ` An Article 6(3) exemption condition was met but was rejected because the system poses a significant risk of harm.`;
    }

    const applicableArticles = ['Article 6: Classification', 'Article 9-16: High-Risk Obligations'];
    let obligations = getObligationsForRoles('HIGH_RISK', input.role);

    if (article50Matches.length > 0) {
      applicableArticles.push('Article 50: Transparency Obligations');
      const transparencyObligations = getObligationsForRoles('LIMITED_RISK', input.role);
      obligations = [...obligations, ...transparencyObligations.filter(o => !obligations.includes(o))];
      reasoning += ` The system also triggers Article 50 transparency obligations (matched: ${article50Matches.join(', ')}).`;
    }

    return {
      classification: 'HIGH_RISK',
      confidenceScore: 90,
      evidenceStrength: 90,
      violations: [],
      annex1Matches: [],
      annex3Matches,
      applicableArticles,
      obligations,
      exemptionApplied: false,
      reasoning,
    };
  }

  // STEP 4: Article 50 - Transparency (standalone, when Annex III did not match)
  if (article50Matches.length > 0) {
    return {
      classification: 'LIMITED_RISK',
      confidenceScore: 75,
      evidenceStrength: 75,
      violations: [],
      annex1Matches: [],
      annex3Matches: [],
      applicableArticles: ['Article 50: Transparency Obligations'],
      obligations: getObligationsForRoles('LIMITED_RISK', input.role),
      reasoning: `LIMITED RISK: System has transparency obligations under Article 50 (matched: ${article50Matches.join(', ')}). Users must be informed that content is AI-generated.`,
    };
  }

  // STEP 5: GPAI Check
  const isGpai =
    input.productType !== undefined
      ? input.productType === 'gpai'
      : textContainsTrigger(combinedText, 'general purpose') || textContainsTrigger(combinedText, 'large language');
  if (isGpai) {
    const isSystemicRisk =
      !!input.gpaiSystemicRiskDesignation ||
      (input.gpaiTrainingComputeFLOPs !== undefined && input.gpaiTrainingComputeFLOPs >= 1e25);

    if (isSystemicRisk) {
      const trigger = input.gpaiSystemicRiskDesignation
        ? 'a Commission systemic-risk designation'
        : `training compute of ${input.gpaiTrainingComputeFLOPs} FLOPs (>= 1e25 threshold)`;
      return {
        classification: 'GPAI',
        confidenceScore: 85,
        evidenceStrength: 85,
        violations: [],
        annex1Matches: [],
        annex3Matches: [],
        applicableArticles: [
          'Article 3(1): GPAI Definition',
          'Article 53: GPAI Provider Obligations',
          'Article 51: Systemic Risk Classification',
          'Article 55: Systemic Risk Obligations',
        ],
        obligations: getObligationsForRoles('GPAI_SYSTEMIC', input.role),
        reasoning: `GPAI (Systemic Risk): System qualifies as General Purpose AI with systemic risk under Article 51, based on ${trigger}. Enhanced obligations under Article 55 apply in addition to standard Article 53 provider obligations.`,
      };
    }

    return {
      classification: 'GPAI',
      confidenceScore: 80,
      evidenceStrength: 80,
      violations: [],
      annex1Matches: [],
      annex3Matches: [],
      applicableArticles: ['Article 3(1): GPAI Definition', 'Article 53: GPAI Provider Obligations'],
      obligations: getObligationsForRoles('GPAI', input.role),
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
        obligations: getObligationsForRoles('HIGH_RISK', input.role),
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
        obligations: getObligationsForRoles('LIMITED_RISK', input.role),
        riskScore,
        reasoning: `LIMITED RISK (Organizational Assessment): Risk score ${riskScore}/25 indicates limited organizational risk.`,
      };
    }
  }

  // STEP 7: Default - Minimal Risk
  const riskScore = (input.riskSeverity !== undefined && input.riskLikelihood !== undefined)
    ? input.riskSeverity * input.riskLikelihood
    : undefined;

  const result: CoreResult = {
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