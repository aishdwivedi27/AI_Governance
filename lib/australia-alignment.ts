// lib/australia-alignment.ts
//
// Australia's voluntary AI standard and the reasoning that decides whether a system is aligned
// to it and to the EU AI Act. Pure (no fs, no DB): the wizard (browser), the classify API and the
// report all import it. Only *types* come from the other lib modules, so there is no runtime cycle.
//
// Standard used: the Guidance for AI Adoption (DISR / National AI Centre, 21 October 2025), which
// evolved the Voluntary AI Safety Standard (10 guardrails, September 2024) into six essential
// practices. The guardrail crosswalk below is indicative (the practices condense the guardrails),
// not an official table. Wording should be re-checked against industry.gov.au when it is updated.
import { normalizeText } from './text-match';
import type { TriState, WizardAnswers, ScreeningQuestion } from './assessment-flow';
import type { EvidenceChecklistItemDraft } from './classification-engine';

export const AUSTRALIA_GEOGRAPHY = 'Australia';

/** Shown in the wizard, the result view and the PDF wherever the Australia mapping appears. */
export const AUSTRALIA_DISCLAIMER =
  "Best-effort mapping to Australia's voluntary Guidance for AI Adoption, based on self-declared answers and an indicative crosswalk to the VAISS guardrails. " +
  'It is not a conformity assessment, certification or legal advice. A qualified expert (AI governance, legal or compliance) must review this result against the official ' +
  'Australian Government guidance before it is relied on; evidence for each item is tracked in the checklist.';

export function isAustraliaSelected(geographies: string[] | undefined): boolean {
  return !!geographies?.includes(AUSTRALIA_GEOGRAPHY);
}

export const AUSTRALIA_STANDARD = {
  name: 'Guidance for AI Adoption',
  shortName: 'Australian AI adoption guidance (VAISS successor)',
  publisher: 'Australian Government, Department of Industry, Science and Resources / National AI Centre',
  published: '2025-10-21',
  supersedes: 'Voluntary AI Safety Standard (VAISS), 10 guardrails, September 2024',
  url: 'https://www.industry.gov.au/publications/guidance-for-ai-adoption',
  voluntary: true,
} as const;

/** The 10 VAISS guardrails, kept so results can still be expressed in guardrail terms. */
export const VAISS_GUARDRAILS: Record<number, string> = {
  1: 'Establish, implement and publish an accountability process',
  2: 'Establish and implement a risk management process',
  3: 'Protect AI systems and implement data governance',
  4: 'Test AI models and systems, and monitor once deployed',
  5: 'Enable human control or intervention',
  6: 'Inform end-users about AI-enabled decisions, interactions and content',
  7: 'Establish processes for people impacted by AI to challenge use or outcomes',
  8: 'Be transparent with other organisations across the AI supply chain',
  9: 'Keep and maintain records so third parties can assess compliance',
  10: 'Engage stakeholders and evaluate their needs, with a focus on safety, diversity, inclusion and fairness',
};

export type PracticeId = 'accountability' | 'impacts' | 'risk' | 'information' | 'testing' | 'human_control';

export interface AustraliaPractice {
  id: PracticeId;
  number: number;
  name: string;
  /** Indicative VAISS guardrails this practice condenses. */
  guardrails: number[];
}

export const AUSTRALIA_PRACTICES: AustraliaPractice[] = [
  { id: 'accountability', number: 1, name: 'Decide who is accountable', guardrails: [1, 9] },
  { id: 'impacts', number: 2, name: 'Understand impacts and plan accordingly', guardrails: [10] },
  { id: 'risk', number: 3, name: 'Measure and manage risks', guardrails: [2, 3] },
  { id: 'information', number: 4, name: 'Share essential information', guardrails: [6, 8, 9] },
  { id: 'testing', number: 5, name: 'Test and monitor', guardrails: [4] },
  { id: 'human_control', number: 6, name: 'Maintain human control', guardrails: [5, 7] },
];

interface AustraliaQuestionDef {
  key: string;
  practice: PracticeId;
  label: string;
  text: string;
  help: string;
  /** What to do when the answer is not a confirmed Yes. */
  action: string;
  /** Evidence that would back a Yes; becomes the checklist artifact. */
  artifact: string;
  /** EU AI Act article numbers this control supports (used for the EU cross-check). */
  euArticles: string[];
  /** A No here is a hard gap (not just partial) for higher-risk or provider systems. */
  criticalWhenElevated: boolean;
}

const QUESTIONS: AustraliaQuestionDef[] = [
  {
    key: 'accountability_owner',
    practice: 'accountability',
    label: 'Named accountable owner',
    text: 'Is a named person or team accountable for this AI system across its whole lifecycle?',
    help: 'Practice 1: accountability sits with a specific owner, not "the organisation".',
    action: 'Assign a named accountable owner and record their responsibilities.',
    artifact: 'Accountable owner assignment and responsibilities',
    euArticles: ['16', '23', '24', '26'],
    criticalWhenElevated: true,
  },
  {
    key: 'accountability_policy',
    practice: 'accountability',
    label: 'AI governance policy',
    text: 'Do you have a documented AI governance policy or strategy that covers this system, including how you meet your legal obligations?',
    help: 'For example an AI policy, an AI register that lists this system and a process for regulatory compliance.',
    action: 'Document an AI governance policy covering this system and add it to an AI register.',
    artifact: 'AI governance policy and AI register entry',
    euArticles: ['16'],
    criticalWhenElevated: false,
  },
  {
    key: 'impacts_assessed',
    practice: 'impacts',
    label: 'Impact assessment',
    text: 'Have you assessed the potential impacts of this system on people, groups and society, including bias and fairness?',
    help: 'Practice 2: identify who could be harmed or excluded before deployment and plan for it.',
    action: 'Carry out and record an AI impact assessment (people affected, harms, bias and fairness).',
    artifact: 'AI impact assessment',
    euArticles: ['27'],
    criticalWhenElevated: true,
  },
  {
    key: 'impacts_stakeholders',
    practice: 'impacts',
    label: 'Stakeholder engagement',
    text: 'Have you engaged the people and groups the system affects (users, impacted communities, domain experts) about its design and use?',
    help: 'Includes affected staff, customers and, where relevant, First Nations or other communities.',
    action: 'Engage affected stakeholders and record what you heard and what changed as a result.',
    artifact: 'Stakeholder engagement record',
    euArticles: [],
    criticalWhenElevated: false,
  },
  {
    key: 'risk_process',
    practice: 'risk',
    label: 'Risk management process',
    text: 'Is there a risk management process that identifies, rates and mitigates the risks of this system throughout its life?',
    help: 'Practice 3: risks are measured and treated on an ongoing basis, not once at launch.',
    action: 'Establish a risk register and mitigation plan for this system, reviewed on a fixed cadence.',
    artifact: 'Risk register and mitigation plan',
    euArticles: ['9', '55'],
    criticalWhenElevated: true,
  },
  {
    key: 'risk_data',
    practice: 'risk',
    label: 'Data governance and security',
    text: 'Are controls in place for the quality, provenance and security of the data and of the AI system itself?',
    help: 'For example data lineage, access control, privacy protection and protection against misuse or attack.',
    action: 'Put data quality, provenance and security controls in place and document them.',
    artifact: 'Data governance and security controls',
    euArticles: ['10', '15'],
    criticalWhenElevated: false,
  },
  {
    key: 'information_users',
    practice: 'information',
    label: 'Disclosure to people',
    text: 'Are people told when they are interacting with AI, when AI-generated content is used, or when AI contributes to a decision about them?',
    help: 'Practice 4: essential information is shared with the people affected.',
    action: 'Add clear AI disclosure at each point where people interact with, or are affected by, the system.',
    artifact: 'AI disclosure notice and where it is shown',
    euArticles: ['13', '50'],
    criticalWhenElevated: false,
  },
  {
    key: 'information_records',
    practice: 'information',
    label: 'Records and supply-chain transparency',
    text: 'Do you keep records and documentation about the system, and share the information other organisations in the supply chain need?',
    help: 'For example model and data documentation, logs and information passed to suppliers, customers or auditors.',
    action: 'Maintain system documentation and logs, and agree what is shared with suppliers and customers.',
    artifact: 'System documentation, logs and supply-chain information sharing',
    euArticles: ['11', '12', '13', '53'],
    criticalWhenElevated: false,
  },
  {
    key: 'testing_predeploy',
    practice: 'testing',
    label: 'Pre-deployment testing',
    text: 'Was the system tested for performance, safety and bias against defined acceptance criteria before deployment?',
    help: 'Practice 5: test before release, and again after any significant change.',
    action: 'Define acceptance criteria and run and record pre-deployment performance, safety and bias tests.',
    artifact: 'Pre-deployment test plan and results',
    euArticles: ['15', '55'],
    criticalWhenElevated: true,
  },
  {
    key: 'testing_monitor',
    practice: 'testing',
    label: 'Post-deployment monitoring',
    text: 'Is the system monitored after deployment, with incident handling and triggers to re-test, pause or withdraw it?',
    help: 'For example drift and error monitoring, an incident process and a defined rollback or shutdown path.',
    action: 'Set up monitoring, an incident process and re-test / withdrawal triggers.',
    artifact: 'Monitoring plan and incident procedure',
    euArticles: ['12', '26'],
    criticalWhenElevated: false,
  },
  {
    key: 'human_control_oversight',
    practice: 'human_control',
    label: 'Meaningful human oversight',
    text: 'Can a trained person meaningfully oversee the system and intervene in or override its outputs?',
    help: 'Practice 6: people stay in control, especially where decisions affect individuals.',
    action: 'Define who oversees the system, train them and give them the ability to intervene or override.',
    artifact: 'Human oversight procedure and training record',
    euArticles: ['14', '26'],
    criticalWhenElevated: true,
  },
  {
    key: 'human_control_challenge',
    practice: 'human_control',
    label: 'Route to challenge outcomes',
    text: 'Can people affected by the system challenge its use or outcomes and get a review by a person?',
    help: 'For example an appeal or complaints process with a stated response time.',
    action: 'Provide a way for affected people to challenge outcomes and get a human review.',
    artifact: 'Contestability / appeal process',
    euArticles: ['86'],
    criticalWhenElevated: false,
  },
];

const questionId = (key: string) => `australia.${key}`;

export const AUSTRALIA_QUESTION_KEYS: string[] = QUESTIONS.map(q => q.key);

/** The Australia questions in the same shape as the EU screening questions, so the wizard can reuse its UI. */
export function getAustraliaQuestions(): ScreeningQuestion[] {
  return QUESTIONS.map(q => ({
    id: questionId(q.key),
    step: 'australia',
    label: q.label,
    text: q.text,
    helpText: q.help,
    examples: [],
    article: `Australia: ${AUSTRALIA_PRACTICES.find(p => p.id === q.practice)!.name}`,
  }));
}

export function getAustraliaAnswer(answers: WizardAnswers, key: string): TriState | undefined {
  return answers.australiaAnswers?.[key];
}

export function isAustraliaStepComplete(answers: WizardAnswers): boolean {
  return QUESTIONS.every(q => getAustraliaAnswer(answers, q.key) !== undefined);
}

// ---------------------------------------------------------------------------
// Contradiction signals: a "Yes" that other information the user gave calls into question
// ---------------------------------------------------------------------------

const AUTOMATION_TERMS = [
  'fully automated',
  'fully autonomous',
  'without human',
  'no human',
  'automated decision',
  'automatically decides',
  'autonomous decision',
];

/** Deterministic reasons to doubt a "Yes". Exact substring matching only; no fuzzy guessing. */
export function getAustraliaSignals(key: string, answers: WizardAnswers): string[] {
  if (getAustraliaAnswer(answers, key) !== 'yes') return [];
  const signals: string[] = [];
  const text = normalizeText(
    [answers.systemName, answers.description, answers.primaryFunction].filter(Boolean).join(' ')
  );

  if (key === 'human_control_oversight') {
    const hits = AUTOMATION_TERMS.filter(t => text.includes(normalizeText(t)));
    if (hits.length) {
      signals.push(`Your description mentions ${hits.map(h => `"${h}"`).join(', ')}, which suggests decisions are made without a person.`);
    }
    if (answers.productType === 'agentic') {
      signals.push('You described the product type as an agentic system, where autonomous action makes oversight harder to guarantee.');
    }
  }
  if (key === 'impacts_assessed' && (answers.vulnerableGroups?.length ?? 0) > 0) {
    if (getAustraliaAnswer(answers, 'impacts_stakeholders') !== 'yes') {
      signals.push(
        `You said the system affects vulnerable groups (${answers.vulnerableGroups!.join(', ')}) but have not engaged affected stakeholders.`
      );
    }
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

export type PracticeStatus = 'aligned' | 'partial' | 'gap';
export type Verdict = 'aligned' | 'partially_aligned' | 'not_aligned';
export type AdoptionLevel = 'foundations' | 'implementation';

export interface AustraliaQuestionResult {
  id: string;
  label: string;
  answer: TriState | 'unanswered';
  signals: string[];
}

export interface PracticeResult {
  id: PracticeId;
  number: number;
  name: string;
  guardrails: { number: number; name: string }[];
  status: PracticeStatus;
  reasons: string[];
  questions: AustraliaQuestionResult[];
  actions: string[];
}

export type ObligationStatus = 'supported' | 'gap' | 'unverified' | 'not_assessed';

export interface EuObligationCheck {
  obligation: string;
  status: ObligationStatus;
  /** Australia control questions (labels) the status is based on. */
  basedOn: string[];
}

export interface AustraliaAlignment {
  standard: typeof AUSTRALIA_STANDARD;
  level: AdoptionLevel;
  levelReasons: string[];
  practices: PracticeResult[];
  vaiss: { verdict: Verdict; summary: string };
  euAiAct: { verdict: Verdict; summary: string; obligations: EuObligationCheck[] };
  crossCheck: string[];
  reasoning: string[];
  checklist: EvidenceChecklistItemDraft[];
  caveat: string;
}

export interface AlignmentInput {
  answers: WizardAnswers;
  /** EU classification, e.g. HIGH_RISK. */
  classification: string;
  /** EU obligations for the tier and roles, as produced by the engine. */
  obligations: string[];
}

const ELEVATED_CLASSIFICATIONS = ['HIGH_RISK', 'UNACCEPTABLE_RISK', 'GPAI'];
const MANDATORY_CLASSIFICATIONS = ['HIGH_RISK', 'GPAI'];

function pretty(s: string): string {
  return s.replace(/_/g, ' ');
}

function determineLevel(input: AlignmentInput): { level: AdoptionLevel; reasons: string[] } {
  const { answers, classification } = input;
  const reasons: string[] = [];
  if (ELEVATED_CLASSIFICATIONS.includes(classification)) {
    reasons.push(`The EU classification is ${pretty(classification)}, which is a higher-risk use.`);
  }
  const roles = answers.role ?? [];
  if (roles.includes('provider') || roles.includes('product_manufacturer')) {
    reasons.push('You build or supply the system, so the implementation guidance applies.');
  }
  if ((answers.vulnerableGroups?.length ?? 0) > 0) reasons.push('The system affects vulnerable groups.');
  if (answers.fundamentalRightsImpact) reasons.push('The system may impact fundamental rights.');

  return reasons.length
    ? { level: 'implementation', reasons }
    : {
        level: 'foundations',
        reasons: ['Lower-risk use where you adopt rather than build the system, so the foundations guidance is enough.'],
      };
}

function euArticlesOf(obligation: string): string[] {
  const numbers = Array.from(obligation.matchAll(/Article (\d+)/g)).map(m => m[1]);
  if (/fundamental rights impact/i.test(obligation)) numbers.push('27');
  return Array.from(new Set(numbers));
}

export function assessAlignment(input: AlignmentInput): AustraliaAlignment {
  const { answers, classification } = input;
  const { level, reasons: levelReasons } = determineLevel(input);
  const elevated = level === 'implementation';

  // ---- practices ----------------------------------------------------------
  const practices: PracticeResult[] = AUSTRALIA_PRACTICES.map(p => {
    const defs = QUESTIONS.filter(q => q.practice === p.id);
    const results: AustraliaQuestionResult[] = defs.map(q => ({
      id: questionId(q.key),
      label: q.label,
      answer: getAustraliaAnswer(answers, q.key) ?? 'unanswered',
      signals: getAustraliaSignals(q.key, answers),
    }));

    const yes = results.filter(r => r.answer === 'yes').length;
    let status: PracticeStatus = yes === defs.length ? 'aligned' : yes === 0 ? 'gap' : 'partial';
    const reasons: string[] = [];
    const actions: string[] = [];

    defs.forEach((q, i) => {
      const r = results[i];
      if (r.answer === 'yes') {
        reasons.push(`${q.label}: confirmed.`);
      } else if (r.answer === 'no') {
        reasons.push(`${q.label}: not in place.`);
        actions.push(q.action);
        if (elevated && q.criticalWhenElevated) {
          status = 'gap';
          reasons.push(`This control is essential for a ${level} use, so the practice counts as a gap.`);
        }
      } else {
        reasons.push(`${q.label}: answered "unsure", which is never counted as aligned.`);
        actions.push(`Confirm whether this is in place: ${q.action}`);
      }
      for (const s of r.signals) {
        reasons.push(`${q.label}: answered Yes, but ${s.charAt(0).toLowerCase()}${s.slice(1)} Provide evidence.`);
        actions.push(`Evidence the "Yes" for "${q.label}" against: ${s}`);
        if (status === 'aligned') status = 'partial';
      }
    });

    return {
      id: p.id,
      number: p.number,
      name: p.name,
      guardrails: p.guardrails.map(n => ({ number: n, name: VAISS_GUARDRAILS[n] })),
      status,
      reasons,
      questions: results,
      actions,
    };
  });

  const gaps = practices.filter(p => p.status === 'gap');
  const partials = practices.filter(p => p.status === 'partial');

  // ---- VAISS verdict ------------------------------------------------------
  let vaissVerdict: Verdict;
  if (gaps.length === 0 && partials.length === 0) vaissVerdict = 'aligned';
  else if ((elevated && gaps.length > 0) || gaps.length >= 3) vaissVerdict = 'not_aligned';
  else vaissVerdict = 'partially_aligned';

  const vaissSummary =
    vaissVerdict === 'aligned'
      ? `All six practices are confirmed for the ${level} level.`
      : `${practices.length - gaps.length - partials.length} of ${practices.length} practices aligned, ${partials.length} partial, ${gaps.length} gap${gaps.length === 1 ? '' : 's'} (${level} level).` +
        (vaissVerdict === 'not_aligned' && elevated && gaps.length < 3
          ? ' A gap in an essential control on a higher-risk use makes the system not aligned.'
          : '');

  // ---- EU AI Act cross-check ---------------------------------------------
  const byQuestion = (key: string) => QUESTIONS.find(q => q.key === key)!;
  const obligations: EuObligationCheck[] = input.obligations.map(obligation => {
    const articles = euArticlesOf(obligation);
    const linked = QUESTIONS.filter(q => q.euArticles.some(a => articles.includes(a)));
    const answersFor = linked.map(q => getAustraliaAnswer(answers, q.key));
    let status: ObligationStatus;
    if (linked.length === 0) status = 'not_assessed';
    else if (answersFor.includes('no')) status = 'gap';
    else if (answersFor.every(a => a === 'yes')) status = 'supported';
    else status = 'unverified';
    return { obligation, status, basedOn: linked.map(q => byQuestion(q.key).label) };
  });

  const count = (s: ObligationStatus) => obligations.filter(o => o.status === s).length;
  let euVerdict: Verdict;
  let euSummary: string;
  if (classification === 'UNACCEPTABLE_RISK') {
    euVerdict = 'not_aligned';
    euSummary = 'A prohibited practice under Article 5 cannot be brought into alignment with controls; it must not be deployed.';
  } else if (obligations.length === 0) {
    euVerdict = 'aligned';
    euSummary = 'No mandatory EU obligations were derived for this classification and role.';
  } else {
    if (count('gap') > 0 && MANDATORY_CLASSIFICATIONS.includes(classification)) euVerdict = 'not_aligned';
    else if (count('supported') === obligations.length) euVerdict = 'aligned';
    else euVerdict = 'partially_aligned';
    euSummary =
      `${count('supported')} of ${obligations.length} obligations supported by confirmed controls, ` +
      `${count('gap')} with a gap, ${count('unverified')} unverified, ${count('not_assessed')} not covered by these questions.`;
  }

  // ---- cross-check --------------------------------------------------------
  const crossCheck: string[] = [];
  if (classification === 'UNACCEPTABLE_RISK') {
    crossCheck.push('Strong voluntary practices do not offset an EU prohibition: the EU result governs for any EU-facing use.');
  }
  if (vaissVerdict === 'aligned' && euVerdict !== 'aligned' && classification !== 'UNACCEPTABLE_RISK') {
    crossCheck.push(
      'The system meets the voluntary Australian practices but the EU obligations still need documented evidence (see the checklist)' +
        (MANDATORY_CLASSIFICATIONS.includes(classification) ? ', and conformity assessment where the Act requires it.' : '.')
    );
  }
  if (euVerdict === 'aligned' && vaissVerdict !== 'aligned') {
    crossCheck.push(
      'The EU Act imposes few or no obligations for this tier, but the Australian guidance still expects the practices marked as partial or gap.'
    );
  }
  if (vaissVerdict !== 'aligned' && euVerdict !== 'aligned' && classification !== 'UNACCEPTABLE_RISK') {
    crossCheck.push('The same missing controls drive both results, so closing the gaps below improves both.');
  }
  crossCheck.push(
    'Australian guidance is voluntary and creates no legal duties; EU obligations are legally binding for EU-facing systems. Australian privacy, consumer and sector law still applies separately.'
  );

  // ---- reasoning chain ----------------------------------------------------
  const reasoning: string[] = [
    `Level: ${level}. ${levelReasons.join(' ')}`,
    ...practices.map(p => `Practice ${p.number} "${p.name}": ${p.status.toUpperCase()}. ${p.reasons.filter(r => !r.endsWith('confirmed.')).join(' ') || 'All controls confirmed.'}`),
    `Australian result: ${pretty(vaissVerdict)}. ${vaissSummary}`,
    `EU AI Act result: ${pretty(euVerdict)}. ${euSummary}`,
  ];

  // ---- checklist ----------------------------------------------------------
  const checklist: EvidenceChecklistItemDraft[] = practices
    .filter(p => p.status !== 'aligned')
    .map(p => {
      const failing = QUESTIONS.filter(q => q.practice === p.id).filter(q => getAustraliaAnswer(answers, q.key) !== 'yes' || getAustraliaSignals(q.key, answers).length);
      return {
        obligationArticle: 'Australia: Guidance for AI Adoption',
        title: `Australia practice ${p.number}: ${p.name}`,
        description: `Status ${p.status}. ${p.actions.join(' ')}`,
        requiredArtifact: failing.map(q => q.artifact).join('; ') || 'Evidence of practice',
      };
    });

  return {
    standard: AUSTRALIA_STANDARD,
    level,
    levelReasons,
    practices,
    vaiss: { verdict: vaissVerdict, summary: vaissSummary },
    euAiAct: { verdict: euVerdict, summary: euSummary, obligations },
    crossCheck,
    reasoning,
    checklist,
    caveat: AUSTRALIA_DISCLAIMER,
  };
}
