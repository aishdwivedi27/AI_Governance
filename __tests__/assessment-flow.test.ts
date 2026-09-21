// __tests__/assessment-flow.test.ts
import {
  MIN_JUSTIFICATION_LENGTH,
  buildAssessmentInput,
  firstIncompleteStep,
  getAnswer,
  getAnswerRows,
  getChallengedAnswers,
  getContradictionSignals,
  getEffectiveRisk,
  getRiskOverrides,
  getVisibleSteps,
  isStepComplete,
  sanitizeAnswers,
  setAnswer,
  suggestRisk,
} from '../lib/assessment-flow';
import type { WizardAnswers } from '../lib/assessment-flow';
import { getWizardRules } from '../lib/classification-engine';

const rules = getWizardRules();
const ids = (answers: WizardAnswers) => getVisibleSteps(answers).map(s => s.id);

const base: WizardAnswers = {
  isAISystem: true,
  systemName: 'Hiring Assistant',
  description: 'Automated recruitment tool that ranks candidates from CV screening.',
  productType: 'decision_support',
  primaryFunction: 'Ranks job applicants',
  role: ['deployer'],
  industry: 'Employment/HR',
  geographies: ['EU'],
};

describe('getVisibleSteps (branching)', () => {
  test('gate "No" ends the flow', () => {
    expect(ids({ isAISystem: false })).toEqual(['gate']);
  });

  test('exemption step only appears when an Annex III area is Yes or Unsure', () => {
    expect(ids({ ...base, annex3Answers: { employment: 'no' } })).not.toContain('exemption');
    expect(ids({ ...base, annex3Answers: { employment: 'yes' } })).toContain('exemption');
    expect(ids({ ...base, annex3Answers: { employment: 'unsure' } })).toContain('exemption');
  });

  test('an Article 5 "Yes" skips the exemption step but keeps context and review', () => {
    const steps = ids({ ...base, annex3Answers: { employment: 'yes' }, article5Answers: { social_scoring: 'yes' } });
    expect(steps).not.toContain('exemption');
    expect(steps).toEqual(['gate', 'product', 'role', 'sector', 'article5', 'context', 'review']);
  });
});

describe('answer helpers', () => {
  test('getAnswer/setAnswer round-trip for every question group', () => {
    let a: WizardAnswers = {};
    a = setAnswer(a, 'annex1', 'unsure');
    a = setAnswer(a, 'annex3.employment', 'yes');
    a = setAnswer(a, 'article5.social_scoring', 'no');
    a = setAnswer(a, 'exemption.significantRiskOfHarm', 'no');
    expect(getAnswer(a, 'annex1')).toBe('unsure');
    expect(getAnswer(a, 'annex3.employment')).toBe('yes');
    expect(getAnswer(a, 'article5.social_scoring')).toBe('no');
    expect(getAnswer(a, 'exemption.significantRiskOfHarm')).toBe('no');
    expect(getAnswer(a, 'annex3.education')).toBeUndefined();
  });

  test('sanitizeAnswers drops unknown keys', () => {
    const clean = sanitizeAnswers({ systemName: 'x', sessionId: 'abc', evil: 1, role: ['deployer'] });
    expect(clean).toEqual({ systemName: 'x', role: ['deployer'] });
  });

  test('buildAssessmentInput passes structured answers through and hides GPAI fields for other products', () => {
    const input = buildAssessmentInput({
      ...base,
      annex3Answers: { employment: 'yes' },
      gpaiTrainingComputeFLOPs: 1e25,
    });
    expect(input.annex3Answers).toEqual({ employment: 'yes' });
    expect(input.gpaiTrainingComputeFLOPs).toBeUndefined();
    expect(buildAssessmentInput({ ...base, productType: 'gpai', gpaiTrainingComputeFLOPs: 1e25 }).gpaiTrainingComputeFLOPs).toBe(1e25);
  });
});

describe('getContradictionSignals', () => {
  test('flags a "No" on Annex III employment when the description mentions recruitment terms', () => {
    const signals = getContradictionSignals('annex3.employment', { ...base, annex3Answers: { employment: 'no' } }, rules);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatch(/recruitment/);
  });

  test('does not flag Yes, Unsure or unanswered', () => {
    expect(getContradictionSignals('annex3.employment', { ...base, annex3Answers: { employment: 'yes' } }, rules)).toEqual([]);
    expect(getContradictionSignals('annex3.employment', { ...base, annex3Answers: { employment: 'unsure' } }, rules)).toEqual([]);
    expect(getContradictionSignals('annex3.employment', base, rules)).toEqual([]);
  });

  test('does not flag a consistent "No"', () => {
    expect(getContradictionSignals('annex3.education', { ...base, annex3Answers: { education: 'no' } }, rules)).toEqual([]);
  });

  test('biometric product type contradicts a "No" on the biometrics category and Article 5 biometric practices', () => {
    const a: WizardAnswers = {
      ...base,
      description: 'Something else entirely',
      productType: 'biometric',
      annex3Answers: { biometrics: 'no' },
      article5Answers: { real_time_remote_biometric_identification: 'no' },
    };
    expect(getContradictionSignals('annex3.biometrics', a, rules).join(' ')).toMatch(/biometric system/);
    expect(getContradictionSignals('article5.real_time_remote_biometric_identification', a, rules).join(' ')).toMatch(/biometric system/);
  });

  test('a Yes on an Article 5 biometric practice contradicts "No" on the biometrics category', () => {
    const a: WizardAnswers = {
      ...base,
      description: 'Something else entirely',
      annex3Answers: { biometrics: 'no' },
      article5Answers: { facial_image_scraping: 'yes' },
    };
    expect(getContradictionSignals('annex3.biometrics', a, rules)).toHaveLength(1);
  });

  test('"No" to significant risk of harm conflicts with vulnerable groups / fundamental rights', () => {
    const a: WizardAnswers = {
      ...base,
      vulnerableGroups: ['Children'],
      fundamentalRightsImpact: true,
      exemptionAnswers: { significantRiskOfHarm: 'no' },
    };
    expect(getContradictionSignals('exemption.significantRiskOfHarm', a, rules)).toHaveLength(2);
  });
});

describe('completeness and challenges', () => {
  const challenged: WizardAnswers = {
    ...base,
    annex1Answer: 'no',
    annex3Answers: Object.fromEntries(rules.annexIII.map(c => [c.id, 'no'])) as WizardAnswers['annex3Answers'],
  };

  test('a challenged "No" is incomplete until a long-enough justification exists', () => {
    expect(getChallengedAnswers(challenged, rules).map(c => c.questionId)).toEqual(['annex3.employment']);
    expect(isStepComplete('sector', challenged, rules)).toBe(false);

    const short = { ...challenged, justifications: { 'annex3.employment': 'nope' } };
    expect(isStepComplete('sector', short, rules)).toBe(false);

    const ok = {
      ...challenged,
      justifications: { 'annex3.employment': 'x'.repeat(MIN_JUSTIFICATION_LENGTH) },
    };
    expect(isStepComplete('sector', ok, rules)).toBe(true);
  });

  test('changing the challenged answer to Unsure or Yes needs no justification', () => {
    const unsure = { ...challenged, annex3Answers: { ...challenged.annex3Answers, employment: 'unsure' as const } };
    // Unsure adds sector sub-questions that must be answered
    const withSector = { ...unsure, sectorAnswers: { 'employment.1': 'no' as const, 'employment.2': 'no' as const } };
    expect(isStepComplete('sector', withSector, rules)).toBe(true);
  });

  test('article5 step needs every practice answered', () => {
    expect(isStepComplete('article5', base, rules)).toBe(false);
    const all = Object.fromEntries(rules.article5.map(p => [p.id, 'no'])) as WizardAnswers['article5Answers'];
    expect(isStepComplete('article5', { ...base, description: 'plain calculator', article5Answers: all }, rules)).toBe(true);
  });

  test('product and role steps', () => {
    expect(isStepComplete('product', { ...base, primaryFunction: '' }, rules)).toBe(false);
    expect(isStepComplete('product', base, rules)).toBe(true);
    expect(isStepComplete('role', { ...base, role: [] }, rules)).toBe(false);
    expect(isStepComplete('role', base, rules)).toBe(true);
  });

  test('firstIncompleteStep places a resumed draft at the first unfinished step', () => {
    expect(firstIncompleteStep({ isAISystem: true }, rules)).toBe('product');
    expect(firstIncompleteStep(base, rules)).toBe('sector');
  });
});

describe('getAnswerRows', () => {
  test('lists answers with justifications and skips empty values', () => {
    const rows = getAnswerRows(
      {
        ...base,
        vulnerableGroups: [],
        annex3Answers: { employment: 'no' },
        justifications: { 'annex3.employment': 'because reasons' },
      },
      rules
    );
    const employment = rows.find(r => r.label === 'Employment and Worker Management');
    expect(employment?.value).toBe('No (justification: because reasons)');
    expect(rows.some(r => r.label === 'Vulnerable groups')).toBe(false);
    expect(rows.find(r => r.label === 'Product type')?.value).toBe('Decision-support tool');
  });
});

describe('suggested risk rating', () => {
  const ok = 'Mitigations in place, reviewed by the risk board.';

  test('suggests a baseline for a low-signal system and scales up with signals', () => {
    const low = suggestRisk({ ...base, productType: 'other', annex3Answers: { employment: 'no' } });
    expect([low.riskSeverity, low.riskLikelihood]).toEqual([1, 1]);
    const high = suggestRisk({
      ...base,
      annex3Answers: { employment: 'yes' },
      fundamentalRightsImpact: true,
      vulnerableGroups: ['Children'],
      crossBorderImpact: true,
      generatesOrInteractsWithPeople: true,
    });
    expect(high.riskSeverity).toBe(5);
    expect(high.riskLikelihood).toBeGreaterThan(3);
    expect(high.riskLikelihood).toBeLessThanOrEqual(5);
    expect(high.reasons.riskSeverity.length).toBeGreaterThan(0);
  });

  test('untouched ratings are the suggestion and need no reason', () => {
    const answers = { ...base, fundamentalRightsImpact: true };
    expect(getRiskOverrides(answers)).toEqual([]);
    expect(getEffectiveRisk(answers)).toEqual({
      riskSeverity: suggestRisk(answers).riskSeverity,
      riskLikelihood: suggestRisk(answers).riskLikelihood,
    });
    expect(isStepComplete('context', answers, rules)).toBe(true);
  });

  test('a value equal to the suggestion counts as accepted', () => {
    const s = suggestRisk(base);
    expect(getRiskOverrides({ ...base, riskSeverity: s.riskSeverity })).toEqual([]);
  });

  test('changing a rating requires a written reason to complete the step', () => {
    const s = suggestRisk(base);
    const changed = { ...base, riskLikelihood: s.riskLikelihood === 5 ? 4 : 5 };
    expect(getRiskOverrides(changed)[0]).toMatchObject({ key: 'riskLikelihood', valid: false });
    expect(isStepComplete('context', changed, rules)).toBe(false);
    expect(isStepComplete('context', { ...changed, riskOverrideReasons: { riskLikelihood: 'too short' } }, rules)).toBe(false);
    expect(isStepComplete('context', { ...changed, riskOverrideReasons: { riskLikelihood: ok } }, rules)).toBe(true);
  });

  test('out-of-range values are invalid even with a reason', () => {
    const answers = { ...base, riskSeverity: 9, riskOverrideReasons: { riskSeverity: ok } };
    expect(isStepComplete('context', answers, rules)).toBe(false);
  });

  test('engine input uses the override, and rows record accepted vs changed', () => {
    const s = suggestRisk(base);
    const newSeverity = s.riskSeverity === 5 ? 4 : 5;
    const answers = { ...base, riskSeverity: newSeverity, riskOverrideReasons: { riskSeverity: ok } };
    const input = buildAssessmentInput(answers);
    expect(input.riskSeverity).toBe(newSeverity);
    expect(input.riskLikelihood).toBe(s.riskLikelihood);
    const rows = getAnswerRows(answers, rules);
    expect(rows.find(r => r.label === 'Risk impact (1-5)')?.value).toContain(`changed from suggested ${s.riskSeverity}; reason: ${ok}`);
    expect(rows.find(r => r.label === 'Risk likelihood (1-5)')?.value).toContain('system-suggested, accepted');
  });

  test('sanitizeAnswers keeps override reasons', () => {
    expect(sanitizeAnswers({ riskOverrideReasons: { riskSeverity: 'x' } }).riskOverrideReasons).toEqual({ riskSeverity: 'x' });
  });
});
