// lib/assessment-flow.ts
//
// Pure (no fs, no DB) definition of the multi-step assessment wizard: steps, screening
// questions, branching, contradiction detection and answer sanitising. Imported by the
// wizard UI (browser), the classification engine and the LLM intake routes, so allowed
// values live in one place. Only *types* are imported from the engine to avoid a runtime
// cycle (the engine imports this module for the shared constants and signal detection).
import type { AssessmentInput, Role } from './classification-engine';
import { normalizeText } from './text-match';
import {
  AUSTRALIA_GEOGRAPHY,
  AUSTRALIA_QUESTION_KEYS,
  getAustraliaQuestions,
  isAustraliaSelected,
  isAustraliaStepComplete,
} from './australia-alignment';

export type TriState = 'yes' | 'no' | 'unsure';
export const TRI_STATES: readonly TriState[] = ['yes', 'no', 'unsure'];

export const PRODUCT_TYPES = [
  { id: 'gpai', label: 'General-purpose AI / foundation model' },
  { id: 'embedded_component', label: 'Component embedded in another product' },
  { id: 'decision_support', label: 'Decision-support tool' },
  { id: 'chatbot_generative', label: 'Chatbot or generative content' },
  { id: 'recommender', label: 'Recommender or ranking system' },
  { id: 'biometric', label: 'Biometric system' },
  { id: 'agentic', label: 'Agentic system' },
  { id: 'other', label: 'Other' },
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number]['id'];
export const PRODUCT_TYPE_IDS: readonly string[] = PRODUCT_TYPES.map(p => p.id);

export const ROLE_OPTIONS: { id: Role; label: string }[] = [
  { id: 'provider', label: 'Provider (develops or places the system on the market)' },
  { id: 'deployer', label: 'Deployer (uses the system under its own authority)' },
  { id: 'importer', label: 'Importer (brings a non-EU system into the EU)' },
  { id: 'distributor', label: 'Distributor (makes the system available, not provider/importer)' },
  { id: 'product_manufacturer', label: 'Product manufacturer (integrates it into its own product)' },
];

export const EXEMPTION_KEYS = [
  'procedural_task',
  'improve_completed_human_activity',
  'pattern_detection',
  'preparatory_task',
  'significantRiskOfHarm',
] as const;
export type ExemptionKey = (typeof EXEMPTION_KEYS)[number];

export const GEOGRAPHY_OPTIONS = ['EU', 'UK', 'USA', AUSTRALIA_GEOGRAPHY, 'Global'];
export const VULNERABLE_GROUP_OPTIONS = [
  'Children',
  'Elderly',
  'Persons with disabilities',
  'Economically disadvantaged',
  'Migrants and asylum seekers',
  'Patients',
];
export const INDUSTRY_OPTIONS = [
  'Healthcare',
  'Finance',
  'Education',
  'Employment/HR',
  'Law enforcement',
  'Transportation',
  'Public administration',
  'Software/Technology',
  'Other',
];

/** The subset of rules.yaml the wizard needs (served by GET /api/rules). */
export interface WizardRules {
  article5: { id: string; article: string; name: string; description: string; triggers: string[] }[];
  annexI: { examples: string[]; triggers: string[] };
  annexIII: { id: string; name: string; examples: string[]; triggers: string[] }[];
  exemptionConditions: { id: string; description: string }[];
}

export interface WizardAnswers extends Partial<AssessmentInput> {
  /** Gate question: is this an "AI system" under Article 3(1)? */
  isAISystem?: boolean;
  primaryFunction?: string;
  affectedParties?: string;
  /** Sector sub-questions, keyed "<categoryId>.<n>". Stored and printed; do not change classification. */
  sectorAnswers?: Record<string, TriState>;
  /** Optional free-form notes added on the review step. */
  additionalNotes?: string;
  /** Australia AI adoption guidance questions, keyed by question key. Only asked when Australia is a selected geography. */
  australiaAnswers?: Record<string, TriState>;
}

// ---------------------------------------------------------------------------
// Steps and branching
// ---------------------------------------------------------------------------

export type StepId =
  | 'gate'
  | 'product'
  | 'role'
  | 'sector'
  | 'article5'
  | 'exemption'
  | 'context'
  | 'australia'
  | 'review';

export interface StepDef {
  id: StepId;
  title: string;
  description: string;
}

export const STEPS: StepDef[] = [
  { id: 'gate', title: 'Is it an AI system?', description: 'Article 3(1) scope check.' },
  { id: 'product', title: 'Your system', description: 'What it is, what it does and who it affects.' },
  { id: 'role', title: 'Your role', description: 'Your position in the AI value chain.' },
  { id: 'sector', title: 'Sector and use case', description: 'Annex I and Annex III high-risk areas.' },
  { id: 'article5', title: 'Prohibited practices', description: 'Article 5 screening.' },
  { id: 'exemption', title: 'Article 6(3) exemption', description: 'Only for Annex III systems.' },
  { id: 'context', title: 'Context', description: 'Geography, vulnerable groups and impact.' },
  {
    id: 'australia',
    title: 'Australia AI practices',
    description: "Australia's voluntary Guidance for AI Adoption (successor to the VAISS guardrails): six essential practices.",
  },
  { id: 'review', title: 'Review and submit', description: 'Check your answers before classifying.' },
];

export function hasAnyYes(record: Record<string, TriState> | undefined): boolean {
  return !!record && Object.values(record).includes('yes');
}

/** Categories the user said Yes/Unsure to; these drive sector sub-questions and the 6(3) step. */
export function getActiveAnnex3Categories(answers: WizardAnswers): string[] {
  return Object.entries(answers.annex3Answers ?? {})
    .filter(([, v]) => v === 'yes' || v === 'unsure')
    .map(([id]) => id);
}

export function getVisibleSteps(answers: WizardAnswers): StepDef[] {
  const byId = (ids: StepId[]) => ids.map(id => STEPS.find(s => s.id === id)!);

  // Gate "No": out of scope, nothing else to ask.
  if (answers.isAISystem === false) return byId(['gate']);

  // Australia questions only when Australia is a selected geography
  const tail: StepId[] = isAustraliaSelected(answers.geographies) ? ['context', 'australia', 'review'] : ['context', 'review'];

  // Article 5 "Yes" is fatal: the exemption step is pointless, but industry/geography are
  // still needed for the record, so only that step is skipped.
  if (hasAnyYes(answers.article5Answers)) {
    return byId(['gate', 'product', 'role', 'sector', 'article5', ...tail]);
  }

  const ids: StepId[] = ['gate', 'product', 'role', 'sector', 'article5'];
  if (getActiveAnnex3Categories(answers).length > 0) ids.push('exemption');
  ids.push(...tail);
  return byId(ids);
}

// ---------------------------------------------------------------------------
// Screening questions
// ---------------------------------------------------------------------------

export interface ScreeningQuestion {
  id: string; // "article5.<id>" | "annex1" | "annex3.<id>" | "exemption.<key>"
  step: StepId;
  label: string; // short name used in summaries, checklist items and the PDF
  text: string; // the question shown to the user
  helpText: string;
  examples: string[];
  article: string; // used for checklist items
}

const ARTICLE5_TEXT: Record<string, string> = {
  manipulation:
    'Does the system use subliminal, deceptive or manipulative techniques that could materially distort people\'s behaviour and cause significant harm?',
  exploitation_of_vulnerabilities:
    'Does the system exploit vulnerabilities of people because of their age, disability or social or economic situation?',
  social_scoring:
    'Does the system score or classify people based on their social behaviour or personal traits in a way that leads to unjustified or disproportionate detrimental treatment?',
  predictive_policing:
    'Does the system predict whether an individual will commit a crime based solely on profiling or personality traits?',
  facial_image_scraping:
    'Does the system build or expand facial recognition databases by untargeted scraping of images from the internet or CCTV?',
  emotion_recognition_workplace_education:
    'Does the system infer the emotions of people in the workplace or in educational institutions?',
  biometric_categorisation_sensitive_traits:
    'Does the system use biometric data to infer sensitive characteristics such as race, political opinions, religion or sexual orientation?',
  real_time_remote_biometric_identification:
    'Is the system used for real-time remote biometric identification in publicly accessible spaces for law enforcement?',
};

const EXEMPTION_TEXT: Record<ExemptionKey, { label: string; text: string; help: string }> = {
  procedural_task: {
    label: 'Narrow procedural task',
    text: 'Does the system only perform a narrow procedural task?',
    help: 'For example converting unstructured data into structured data or classifying documents into categories.',
  },
  improve_completed_human_activity: {
    label: 'Improves a completed human activity',
    text: 'Is the system intended only to improve the result of a human activity that has already been completed?',
    help: 'For example polishing the wording of a document a person has already written.',
  },
  pattern_detection: {
    label: 'Pattern detection without influencing decisions',
    text: 'Does the system only detect decision-making patterns or deviations from them, without replacing or influencing a human assessment?',
    help: 'For example flagging inconsistencies in how graders scored exams, for a human to review afterwards.',
  },
  preparatory_task: {
    label: 'Preparatory task',
    text: 'Does the system only perform a preparatory task for an assessment made by a human?',
    help: 'For example file handling, indexing, or translating documents before a person reviews them.',
  },
  significantRiskOfHarm: {
    label: 'Significant risk of harm',
    text: 'Does the system pose a significant risk of harm to health, safety or fundamental rights, including by materially influencing the outcome of decisions?',
    help: 'If it profiles people, or its output materially affects a decision about them, answer Yes.',
  },
};

// Sector follow-ups shown only for the Annex III categories the user answered Yes/Unsure to.
export const SECTOR_QUESTIONS: Record<string, { id: string; text: string }[]> = {
  biometrics: [
    { id: 'biometrics.1', text: 'Does the system identify individuals (rather than only verify a claimed identity)?' },
    { id: 'biometrics.2', text: 'Is it used in publicly accessible spaces?' },
  ],
  healthcare_ai: [
    { id: 'healthcare_ai.1', text: 'Does its output inform or make clinical decisions about individual patients?' },
    { id: 'healthcare_ai.2', text: 'Is it, or is it part of, a regulated medical device?' },
  ],
  critical_infrastructure: [
    { id: 'critical_infrastructure.1', text: 'Is it a safety component in managing or operating the infrastructure?' },
  ],
  education: [
    { id: 'education.1', text: 'Does it decide or influence admission, assessment outcomes or access to education?' },
  ],
  employment: [
    { id: 'employment.1', text: 'Does it filter, rank or evaluate job candidates or workers?' },
    { id: 'employment.2', text: 'Does it influence promotion, termination or task allocation?' },
  ],
  essential_services: [
    { id: 'essential_services.1', text: 'Does it evaluate people\'s eligibility for benefits, credit or insurance?' },
  ],
  law_enforcement: [
    { id: 'law_enforcement.1', text: 'Is it used by, or on behalf of, law enforcement authorities?' },
  ],
  migration_asylum_border_control: [
    { id: 'migration_asylum_border_control.1', text: 'Is it used by public authorities to assess visa, asylum or border-crossing cases?' },
  ],
  justice_and_democracy: [
    { id: 'justice_and_democracy.1', text: 'Is it used by, or on behalf of, a judicial body or to influence elections?' },
  ],
};

export function humanize(slug: string): string {
  const s = slug.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getScreeningQuestions(rules: WizardRules): ScreeningQuestion[] {
  const questions: ScreeningQuestion[] = [];

  questions.push({
    id: 'annex1',
    step: 'sector',
    label: 'Safety component of a regulated product (Annex I)',
    text:
      'Is the system a safety component of, or itself, a product covered by EU product-safety legislation (for example medical devices, machinery, vehicles, aviation, rail, marine equipment or lifts)?',
    helpText: 'Annex I covers AI that is a safety component of products subject to third-party conformity assessment.',
    examples: rules.annexI.examples.map(humanize),
    article: 'Article 6(1)',
  });

  for (const c of rules.annexIII) {
    questions.push({
      id: `annex3.${c.id}`,
      step: 'sector',
      label: c.name,
      text: `Is the system intended to be used in the area of "${c.name}"?`,
      helpText: `Annex III lists ${c.name.toLowerCase()} as a high-risk area.`,
      examples: c.examples.map(humanize),
      article: 'Article 6(2)',
    });
  }

  for (const p of rules.article5) {
    questions.push({
      id: `article5.${p.id}`,
      step: 'article5',
      label: `${p.name} (Article ${p.article})`,
      text: ARTICLE5_TEXT[p.id] ?? p.description,
      helpText: p.description,
      examples: [],
      article: `Article ${p.article}`,
    });
  }

  for (const key of EXEMPTION_KEYS) {
    const def = EXEMPTION_TEXT[key];
    questions.push({
      id: `exemption.${key}`,
      step: 'exemption',
      label: def.label,
      text: def.text,
      helpText: def.help,
      examples: [],
      article: 'Article 6(3)',
    });
  }

  return questions;
}

export function getQuestion(questionId: string, rules: WizardRules): ScreeningQuestion | undefined {
  return getScreeningQuestions(rules).find(q => q.id === questionId);
}

export function getAnswer(answers: WizardAnswers, questionId: string): TriState | undefined {
  if (questionId === 'annex1') return answers.annex1Answer;
  const [group, key] = questionId.split('.');
  if (group === 'australia') return answers.australiaAnswers?.[key];
  if (group === 'annex3') return answers.annex3Answers?.[key];
  if (group === 'article5') return answers.article5Answers?.[key];
  if (group === 'exemption') return answers.exemptionAnswers?.[key as ExemptionKey];
  return undefined;
}

export function setAnswer(answers: WizardAnswers, questionId: string, value: TriState): WizardAnswers {
  if (questionId === 'annex1') return { ...answers, annex1Answer: value };
  const [group, key] = questionId.split('.');
  if (group === 'australia') return { ...answers, australiaAnswers: { ...answers.australiaAnswers, [key]: value } };
  if (group === 'annex3') return { ...answers, annex3Answers: { ...answers.annex3Answers, [key]: value } };
  if (group === 'article5') return { ...answers, article5Answers: { ...answers.article5Answers, [key]: value } };
  if (group === 'exemption') {
    return { ...answers, exemptionAnswers: { ...answers.exemptionAnswers, [key]: value } as Record<ExemptionKey, TriState> };
  }
  return answers;
}

// ---------------------------------------------------------------------------
// Contradiction detection ("No" answers that other evidence contradicts)
// ---------------------------------------------------------------------------

const BIOMETRIC_ARTICLE5 = [
  'facial_image_scraping',
  'biometric_categorisation_sensitive_traits',
  'real_time_remote_biometric_identification',
  'emotion_recognition_workplace_education',
];

function matchedTriggers(text: string, triggers: string[]): string[] {
  const haystack = normalizeText(text);
  // Exact substring only: a wrong "you may be contradicting yourself" warning is
  // worse than a missed one, so no fuzzy matching here.
  return triggers.filter(t => haystack.includes(normalizeText(t)));
}

/**
 * Reasons a "No" answer looks inconsistent with everything else the user told us.
 * Deterministic and evidence-based; the LLM challenge chat only ever discusses these.
 */
export function getContradictionSignals(
  questionId: string,
  answers: WizardAnswers,
  rules: WizardRules
): string[] {
  if (getAnswer(answers, questionId) !== 'no') return [];

  const text = [answers.systemName, answers.description, answers.primaryFunction, answers.industry]
    .filter(Boolean)
    .join(' ');
  const signals: string[] = [];
  const [group, key] = questionId.split('.');

  const quote = (terms: string[]) => terms.map(t => `"${t}"`).join(', ');

  if (group === 'annex3') {
    const cat = rules.annexIII.find(c => c.id === key);
    if (cat) {
      const hits = matchedTriggers(text, cat.triggers);
      if (hits.length) signals.push(`Your description mentions ${quote(hits)}, which are Annex III "${cat.name}" indicators.`);
    }
    if (key === 'biometrics') {
      if (answers.productType === 'biometric') signals.push('You described the product type as a biometric system.');
      const bioYes = BIOMETRIC_ARTICLE5.filter(id => answers.article5Answers?.[id] === 'yes');
      if (bioYes.length) signals.push('You answered Yes to a biometric practice in the Article 5 screening.');
    }
    if (key === 'law_enforcement' && answers.article5Answers?.predictive_policing === 'yes') {
      signals.push('You answered Yes to predicting criminal offending.');
    }
    if (key === 'healthcare_ai' && answers.annex1Answer === 'yes') {
      signals.push('You said the system is a safety component of a regulated product (which can include medical devices).');
    }
  } else if (group === 'article5') {
    const practice = rules.article5.find(p => p.id === key);
    if (practice) {
      const hits = matchedTriggers(text, practice.triggers);
      if (hits.length) signals.push(`Your description mentions ${quote(hits)}, which relate to Article ${practice.article}.`);
    }
    if (BIOMETRIC_ARTICLE5.includes(key) && answers.productType === 'biometric') {
      signals.push('You described the product type as a biometric system.');
    }
    if (key === 'exploitation_of_vulnerabilities' && (answers.vulnerableGroups?.length ?? 0) > 0) {
      signals.push(`You said the system affects vulnerable groups (${answers.vulnerableGroups!.join(', ')}).`);
    }
    if (
      (key === 'predictive_policing' || key === 'real_time_remote_biometric_identification') &&
      answers.annex3Answers?.law_enforcement === 'yes'
    ) {
      signals.push('You said the system is used in law enforcement.');
    }
  } else if (group === 'annex1' || questionId === 'annex1') {
    const hits = matchedTriggers(text, rules.annexI.triggers);
    if (hits.length) signals.push(`Your description mentions ${quote(hits)}, which are Annex I regulated-product indicators.`);
  } else if (group === 'exemption' && key === 'significantRiskOfHarm') {
    if (answers.fundamentalRightsImpact) signals.push('You said the system affects fundamental rights.');
    if ((answers.vulnerableGroups?.length ?? 0) > 0) {
      signals.push(`You said the system affects vulnerable groups (${answers.vulnerableGroups!.join(', ')}).`);
    }
  }

  return signals;
}

export const MIN_JUSTIFICATION_LENGTH = 20;

export interface ChallengedAnswer {
  questionId: string;
  label: string;
  signals: string[];
  justification: string;
}

/** All "No" answers with contradicting evidence, with their justification if one was given. */
export function getChallengedAnswers(answers: WizardAnswers, rules: WizardRules): ChallengedAnswer[] {
  const out: ChallengedAnswer[] = [];
  for (const q of getScreeningQuestions(rules)) {
    const signals = getContradictionSignals(q.id, answers, rules);
    if (signals.length) {
      out.push({
        questionId: q.id,
        label: q.label,
        signals,
        justification: (answers.justifications?.[q.id] ?? '').trim(),
      });
    }
  }
  return out;
}

function hasJustification(answers: WizardAnswers, questionId: string): boolean {
  return (answers.justifications?.[questionId] ?? '').trim().length >= MIN_JUSTIFICATION_LENGTH;
}

// ---------------------------------------------------------------------------
// Step completeness
// ---------------------------------------------------------------------------

function questionsComplete(step: StepId, answers: WizardAnswers, rules: WizardRules): boolean {
  return getScreeningQuestions(rules)
    .filter(q => q.step === step)
    .every(q => {
      const a = getAnswer(answers, q.id);
      if (!a) return false;
      // A "No" the evidence contradicts needs a written justification to stand.
      return !(a === 'no' && getContradictionSignals(q.id, answers, rules).length > 0 && !hasJustification(answers, q.id));
    });
}

export function isStepComplete(step: StepId, answers: WizardAnswers, rules: WizardRules): boolean {
  switch (step) {
    case 'gate':
      return answers.isAISystem !== undefined;
    case 'product':
      return (
        !!answers.systemName?.trim() &&
        !!answers.description?.trim() &&
        !!answers.productType &&
        PRODUCT_TYPE_IDS.includes(answers.productType) &&
        !!answers.primaryFunction?.trim()
      );
    case 'role':
      return (answers.role?.length ?? 0) > 0;
    case 'sector': {
      if (!questionsComplete('sector', answers, rules)) return false;
      return getActiveAnnex3Categories(answers).every(cat =>
        (SECTOR_QUESTIONS[cat] ?? []).every(q => answers.sectorAnswers?.[q.id] !== undefined)
      );
    }
    case 'article5':
      return questionsComplete('article5', answers, rules);
    case 'exemption':
      return questionsComplete('exemption', answers, rules);
    case 'context':
      return (answers.geographies?.length ?? 0) > 0 && !!answers.industry?.trim();
    case 'australia':
      return isAustraliaStepComplete(answers);
    case 'review':
      return true;
  }
}

/** First visible step that is not complete (used to place a resumed draft). */
export function firstIncompleteStep(answers: WizardAnswers, rules: WizardRules): StepId {
  const steps = getVisibleSteps(answers);
  const found = steps.find(s => s.id !== 'review' && !isStepComplete(s.id, answers, rules));
  return (found ?? steps[steps.length - 1]).id;
}

export function isGpaiComputeVisible(answers: WizardAnswers): boolean {
  return answers.productType === 'gpai';
}

// ---------------------------------------------------------------------------
// Building / sanitising the engine input
// ---------------------------------------------------------------------------

export const ANSWER_KEYS = [
  'systemName',
  'description',
  'industry',
  'geographies',
  'vulnerableGroups',
  'fundamentalRightsImpact',
  'crossBorderImpact',
  'riskSeverity',
  'riskLikelihood',
  'role',
  'productType',
  'article5Answers',
  'annex1Answer',
  'annex3Answers',
  'exemptionAnswers',
  'justifications',
  'generatesOrInteractsWithPeople',
  'gpaiTrainingComputeFLOPs',
  'gpaiSystemicRiskDesignation',
  'isAISystem',
  'primaryFunction',
  'affectedParties',
  'sectorAnswers',
  'additionalNotes',
  'australiaAnswers',
] as const;

/** Keep only known keys; used to persist a clean answers snapshot. */
export function sanitizeAnswers(raw: unknown): WizardAnswers {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const key of ANSWER_KEYS) {
    if ((raw as Record<string, unknown>)[key] !== undefined) out[key] = (raw as Record<string, unknown>)[key];
  }
  const answers = out as WizardAnswers;
  if (answers.australiaAnswers) {
    // Drop stale answers when Australia was deselected, and anything that is not a known question with a valid answer
    const kept: Record<string, TriState> = {};
    if (isAustraliaSelected(answers.geographies)) {
      for (const k of AUSTRALIA_QUESTION_KEYS) {
        const v = answers.australiaAnswers[k];
        if (TRI_STATES.includes(v)) kept[k] = v;
      }
    }
    if (Object.keys(kept).length) answers.australiaAnswers = kept;
    else delete answers.australiaAnswers;
  }
  return answers;
}

/** Turn wizard answers into an engine input (structured answers are passed through as-is). */
export function buildAssessmentInput(answers: WizardAnswers): AssessmentInput {
  return {
    systemName: answers.systemName ?? '',
    description: answers.description ?? '',
    industry: answers.industry ?? '',
    geographies: answers.geographies ?? [],
    vulnerableGroups: answers.vulnerableGroups ?? [],
    fundamentalRightsImpact: !!answers.fundamentalRightsImpact,
    crossBorderImpact: !!answers.crossBorderImpact,
    riskSeverity: answers.riskSeverity,
    riskLikelihood: answers.riskLikelihood,
    role: answers.role ?? [],
    productType: answers.productType,
    article5Answers: answers.article5Answers,
    annex1Answer: answers.annex1Answer,
    annex3Answers: answers.annex3Answers,
    exemptionAnswers: answers.exemptionAnswers,
    justifications: answers.justifications,
    generatesOrInteractsWithPeople: !!answers.generatesOrInteractsWithPeople,
    gpaiTrainingComputeFLOPs: isGpaiComputeVisible(answers) ? answers.gpaiTrainingComputeFLOPs : undefined,
    gpaiSystemicRiskDesignation: isGpaiComputeVisible(answers) ? answers.gpaiSystemicRiskDesignation : undefined,
  };
}

// ---------------------------------------------------------------------------
// Human-readable answer rows (review step and PDF)
// ---------------------------------------------------------------------------

const TRI_LABEL: Record<TriState, string> = { yes: 'Yes', no: 'No', unsure: 'Unsure' };

export interface AnswerRow {
  section: string;
  label: string;
  value: string;
}

export function getAnswerRows(answers: WizardAnswers, rules: WizardRules): AnswerRow[] {
  const rows: AnswerRow[] = [];
  const add = (section: string, label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    rows.push({ section, label, value: Array.isArray(value) ? value.join(', ') : String(value) });
  };

  const productLabel = PRODUCT_TYPES.find(p => p.id === answers.productType)?.label;
  add('System', 'Name', answers.systemName);
  add('System', 'Description', answers.description);
  add('System', 'Product type', productLabel);
  add('System', 'Primary function', answers.primaryFunction);
  add('System', 'Affected parties', answers.affectedParties);
  if (answers.isAISystem !== undefined) add('System', 'Is an AI system (Article 3(1))', answers.isAISystem ? 'Yes' : 'No');

  add('Role', 'Roles', (answers.role ?? []).map(r => ROLE_OPTIONS.find(o => o.id === r)?.label.split(' (')[0] ?? r));

  const questions = getScreeningQuestions(rules);
  const sectionOf: Record<StepId, string> = {
    gate: 'System',
    product: 'System',
    role: 'Role',
    sector: 'Sector and use case',
    article5: 'Article 5 screening',
    exemption: 'Article 6(3) exemption',
    context: 'Context',
    australia: 'Australia AI practices',
    review: 'Review',
  };
  for (const q of questions) {
    const a = getAnswer(answers, q.id);
    if (!a) continue;
    const just = answers.justifications?.[q.id];
    add(sectionOf[q.step], q.label, TRI_LABEL[a] + (just ? ` (justification: ${just})` : ''));
  }
  for (const cat of getActiveAnnex3Categories(answers)) {
    for (const q of SECTOR_QUESTIONS[cat] ?? []) {
      const a = answers.sectorAnswers?.[q.id];
      if (a) add('Sector and use case', q.text, TRI_LABEL[a]);
    }
  }

  if (isAustraliaSelected(answers.geographies)) {
    for (const q of getAustraliaQuestions()) {
      const a = getAnswer(answers, q.id);
      if (a) add(sectionOf.australia, q.label, TRI_LABEL[a]);
    }
  }

  add('Context', 'Industry', answers.industry);
  add('Context', 'Geographies', answers.geographies);
  add('Context', 'Vulnerable groups', answers.vulnerableGroups);
  if (answers.fundamentalRightsImpact !== undefined) add('Context', 'Fundamental rights impact', answers.fundamentalRightsImpact ? 'Yes' : 'No');
  if (answers.crossBorderImpact !== undefined) add('Context', 'Cross-border impact', answers.crossBorderImpact ? 'Yes' : 'No');
  if (answers.generatesOrInteractsWithPeople !== undefined) {
    add('Context', 'Interacts with people or generates synthetic content', answers.generatesOrInteractsWithPeople ? 'Yes' : 'No');
  }
  add('Context', 'Risk severity (1-5)', answers.riskSeverity);
  add('Context', 'Risk likelihood (1-5)', answers.riskLikelihood);
  add('Context', 'GPAI training compute (FLOPs)', answers.gpaiTrainingComputeFLOPs);
  if (answers.gpaiSystemicRiskDesignation !== undefined) {
    add('Context', 'Commission systemic-risk designation', answers.gpaiSystemicRiskDesignation ? 'Yes' : 'No');
  }
  add('Review', 'Additional notes', answers.additionalNotes);

  return rows;
}
