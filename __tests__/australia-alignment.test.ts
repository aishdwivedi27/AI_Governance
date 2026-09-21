// __tests__/australia-alignment.test.ts
import {
  AUSTRALIA_PRACTICES,
  AUSTRALIA_QUESTION_KEYS,
  assessAlignment,
  getAustraliaQuestions,
  getAustraliaSignals,
  isAustraliaSelected,
} from '../lib/australia-alignment';
import {
  GEOGRAPHY_OPTIONS,
  getAnswerRows,
  getVisibleSteps,
  isStepComplete,
  sanitizeAnswers,
  setAnswer,
} from '../lib/assessment-flow';
import type { TriState, WizardAnswers } from '../lib/assessment-flow';
import { classifyAISystem, getWizardRules } from '../lib/classification-engine';
import { validateSuggestions } from '../lib/intake-suggest';

const rules = getWizardRules();

const allAnswers = (value: TriState, overrides: Record<string, TriState> = {}): Record<string, TriState> =>
  Object.fromEntries(AUSTRALIA_QUESTION_KEYS.map(k => [k, overrides[k] ?? value]));

const base: WizardAnswers = {
  isAISystem: true,
  systemName: 'Hiring Assistant',
  description: 'Ranks candidates from CVs to support recruiters.',
  productType: 'decision_support',
  primaryFunction: 'Ranks job applicants',
  role: ['deployer'],
  industry: 'Employment/HR',
  geographies: ['EU', 'Australia'],
  vulnerableGroups: [],
};

const highRisk = { classification: 'HIGH_RISK', obligations: ['Article 14: Assign Human Oversight', 'Article 26: Monitor Operation and Retain Logs'] };

describe('Australia as a geography', () => {
  test('is an explicit option', () => {
    expect(GEOGRAPHY_OPTIONS).toContain('Australia');
    expect(isAustraliaSelected(['EU', 'Australia'])).toBe(true);
    expect(isAustraliaSelected(['Global'])).toBe(false);
  });

  test('is accepted by the LLM suggestion allow-list', () => {
    expect(validateSuggestions({ geographies: ['Australia', 'Mars'] }, rules).geographies).toEqual(['Australia']);
  });
});

describe('wizard step', () => {
  test('appears after context only when Australia is selected', () => {
    const ids = (a: WizardAnswers) => getVisibleSteps(a).map(s => s.id);
    expect(ids({ ...base, geographies: ['EU'] })).not.toContain('australia');
    const steps = ids(base);
    expect(steps.indexOf('australia')).toBe(steps.indexOf('context') + 1);
    expect(steps[steps.length - 1]).toBe('review');
  });

  test('is also shown after an Article 5 "Yes"', () => {
    const steps = getVisibleSteps({ ...base, article5Answers: { social_scoring: 'yes' } }).map(s => s.id);
    expect(steps).toContain('australia');
  });

  test('is complete only when every question is answered', () => {
    expect(isStepComplete('australia', base, rules)).toBe(false);
    const partial = { ...base, australiaAnswers: { accountability_owner: 'yes' as TriState } };
    expect(isStepComplete('australia', partial, rules)).toBe(false);
    expect(isStepComplete('australia', { ...base, australiaAnswers: allAnswers('yes') }, rules)).toBe(true);
  });

  test('setAnswer stores Australia answers and rows appear on the review', () => {
    const q = getAustraliaQuestions()[0];
    const next = setAnswer(base, q.id, 'no');
    expect(next.australiaAnswers).toEqual({ accountability_owner: 'no' });
    const rows = getAnswerRows(next, rules);
    expect(rows.some(r => r.section === 'Australia AI practices' && r.value === 'No')).toBe(true);
  });

  test('sanitizeAnswers drops Australia answers when Australia is not selected, and unknown keys', () => {
    const raw = { ...base, geographies: ['EU'], australiaAnswers: allAnswers('yes') };
    expect(sanitizeAnswers(raw).australiaAnswers).toBeUndefined();
    const kept = sanitizeAnswers({ ...base, australiaAnswers: { ...allAnswers('yes'), bogus: 'yes', accountability_owner: 'maybe' } });
    expect(kept.australiaAnswers).not.toHaveProperty('bogus');
    expect(kept.australiaAnswers).not.toHaveProperty('accountability_owner');
  });
});

describe('assessAlignment - practices and VAISS verdict', () => {
  test('covers all six practices, each with guardrail crosswalk', () => {
    const a = assessAlignment({ answers: { ...base, australiaAnswers: allAnswers('yes') }, ...highRisk });
    expect(a.practices).toHaveLength(6);
    expect(a.practices.map(p => p.number)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const p of a.practices) expect(p.guardrails.length).toBeGreaterThan(0);
    expect(new Set(AUSTRALIA_PRACTICES.flatMap(p => p.guardrails))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  test('all Yes is aligned on both sides for a high-risk deployer', () => {
    const a = assessAlignment({ answers: { ...base, australiaAnswers: allAnswers('yes') }, ...highRisk });
    expect(a.vaiss.verdict).toBe('aligned');
    expect(a.euAiAct.verdict).toBe('aligned');
    expect(a.checklist).toHaveLength(0);
  });

  test('"unsure" is never counted as aligned', () => {
    const a = assessAlignment({ answers: { ...base, australiaAnswers: allAnswers('unsure') }, ...highRisk });
    expect(a.practices.every(p => p.status !== 'aligned')).toBe(true);
    expect(a.vaiss.verdict).not.toBe('aligned');
  });

  test('a missing human oversight control on a high-risk system is a gap and not aligned', () => {
    const answers = { ...base, australiaAnswers: allAnswers('yes', { human_control_oversight: 'no' }) };
    const a = assessAlignment({ answers, ...highRisk });
    const p6 = a.practices.find(p => p.id === 'human_control')!;
    expect(p6.status).toBe('gap');
    expect(a.vaiss.verdict).toBe('not_aligned');
    expect(a.euAiAct.verdict).toBe('not_aligned'); // Article 14 is a mandatory obligation
    expect(a.euAiAct.obligations.find(o => o.obligation.startsWith('Article 14'))!.status).toBe('gap');
    expect(a.checklist.map(c => c.title).join(' ')).toContain('Maintain human control');
  });

  test('the same missing control is only partial for a lower-risk adopter', () => {
    const answers: WizardAnswers = { ...base, role: ['deployer'], australiaAnswers: allAnswers('yes', { human_control_oversight: 'no' }) };
    const a = assessAlignment({ answers, classification: 'MINIMAL_RISK', obligations: [] });
    expect(a.level).toBe('foundations');
    expect(a.practices.find(p => p.id === 'human_control')!.status).toBe('partial');
    expect(a.vaiss.verdict).toBe('partially_aligned');
    expect(a.euAiAct.verdict).toBe('aligned');
    expect(a.crossCheck.join(' ')).toContain('few or no obligations');
  });

  test('implementation level for providers, vulnerable groups or higher-risk classes', () => {
    const answers = { ...base, australiaAnswers: allAnswers('yes') };
    expect(assessAlignment({ answers: { ...answers, role: ['provider'] }, classification: 'MINIMAL_RISK', obligations: [] }).level).toBe('implementation');
    expect(assessAlignment({ answers: { ...answers, vulnerableGroups: ['Children'] }, classification: 'MINIMAL_RISK', obligations: [] }).level).toBe('implementation');
    expect(assessAlignment({ answers, ...highRisk }).level).toBe('implementation');
  });

  test('many gaps make the verdict not aligned even at the foundations level', () => {
    const a = assessAlignment({ answers: { ...base, australiaAnswers: allAnswers('no') }, classification: 'MINIMAL_RISK', obligations: [] });
    expect(a.level).toBe('foundations');
    expect(a.vaiss.verdict).toBe('not_aligned');
  });
});

describe('assessAlignment - contradiction signals', () => {
  const automated: WizardAnswers = { ...base, description: 'A fully automated system that approves loans without human review.' };

  test('a "Yes" on oversight that the description contradicts is flagged and downgrades the practice', () => {
    const answers = { ...automated, australiaAnswers: allAnswers('yes') };
    expect(getAustraliaSignals('human_control_oversight', answers).length).toBeGreaterThan(0);
    const a = assessAlignment({ answers, ...highRisk });
    expect(a.practices.find(p => p.id === 'human_control')!.status).toBe('partial');
    expect(a.vaiss.verdict).toBe('partially_aligned');
  });

  test('no signal for a "No" answer or a consistent description', () => {
    expect(getAustraliaSignals('human_control_oversight', { ...automated, australiaAnswers: allAnswers('no') })).toEqual([]);
    expect(getAustraliaSignals('human_control_oversight', { ...base, australiaAnswers: allAnswers('yes') })).toEqual([]);
  });

  test('vulnerable groups without stakeholder engagement contradicts a "Yes" on impact assessment', () => {
    const answers = { ...base, vulnerableGroups: ['Children'], australiaAnswers: allAnswers('yes', { impacts_stakeholders: 'no' }) };
    expect(getAustraliaSignals('impacts_assessed', answers)).toHaveLength(1);
  });
});

describe('assessAlignment - EU cross-check', () => {
  test('a prohibited practice is never aligned with the EU Act, whatever the controls say', () => {
    const a = assessAlignment({ answers: { ...base, australiaAnswers: allAnswers('yes') }, classification: 'UNACCEPTABLE_RISK', obligations: [] });
    expect(a.euAiAct.verdict).toBe('not_aligned');
    expect(a.crossCheck.join(' ')).toContain('EU prohibition');
  });

  test('obligations that no Australia question covers are reported as not assessed', () => {
    const a = assessAlignment({
      answers: { ...base, australiaAnswers: allAnswers('yes') },
      classification: 'HIGH_RISK',
      obligations: ['Article 23: Verify CE Marking and Documentation'.replace('23', '99')],
    });
    expect(a.euAiAct.obligations[0].status).toBe('not_assessed');
    expect(a.euAiAct.verdict).toBe('partially_aligned');
  });

  test('works end to end with the real engine output', () => {
    const result = classifyAISystem({
      ...base,
      annex3Answers: { employment: 'yes' },
      exemptionAnswers: { procedural_task: 'no', improve_completed_human_activity: 'no', pattern_detection: 'no', preparatory_task: 'no', significantRiskOfHarm: 'yes' },
    } as never);
    expect(result.classification).toBe('HIGH_RISK');
    const a = assessAlignment({
      answers: { ...base, australiaAnswers: allAnswers('yes', { human_control_oversight: 'no' }) },
      classification: result.classification,
      obligations: result.obligations,
    });
    expect(a.euAiAct.obligations.length).toBe(result.obligations.length);
    expect(a.euAiAct.verdict).toBe('not_aligned');
  });

  test('the EU classification is unchanged by selecting Australia', () => {
    const withAu = classifyAISystem({ ...base, australiaAnswers: allAnswers('no') } as never);
    const withoutAu = classifyAISystem({ ...base, geographies: ['EU'] } as never);
    expect(withAu.classification).toBe(withoutAu.classification);
    expect(withAu.obligations).toEqual(withoutAu.obligations);
  });
});
