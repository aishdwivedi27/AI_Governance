// __tests__/classification-structured.test.ts
// Structured wizard answers, pessimistic handling of "unsure", and challenged "No" answers.
import { classifyAISystem } from '../lib/classification-engine';
import type { AssessmentInput } from '../lib/classification-engine';
import { getWizardRules } from '../lib/classification-engine';

const rules = getWizardRules();
const allNo = <T extends string>(keys: T[]) => Object.fromEntries(keys.map(k => [k, 'no'])) as Record<T, 'no'>;

// A system whose description carries no trigger words, with every screening answer "No"
const base: AssessmentInput = {
  systemName: 'Spreadsheet helper',
  description: 'Formats spreadsheet columns for internal reports',
  industry: 'Software/Technology',
  geographies: ['EU'],
  vulnerableGroups: [],
  fundamentalRightsImpact: false,
  crossBorderImpact: false,
  role: ['deployer'],
  productType: 'other',
  annex1Answer: 'no',
  annex3Answers: allNo(rules.annexIII.map(c => c.id)),
  article5Answers: allNo(rules.article5.map(p => p.id)),
  exemptionAnswers: allNo(['procedural_task', 'improve_completed_human_activity', 'pattern_detection', 'preparatory_task', 'significantRiskOfHarm']),
  generatesOrInteractsWithPeople: false,
};

const withAnnex3 = (id: string, value: 'yes' | 'no' | 'unsure'): AssessmentInput => ({
  ...base,
  annex3Answers: { ...base.annex3Answers, [id]: value },
});

describe('structured answers are authoritative', () => {
  test('all "No" gives minimal risk with no uncertainty', () => {
    const result = classifyAISystem(base);
    expect(result.classification).toBe('MINIMAL_RISK');
    expect(result.uncertainty).toBeUndefined();
  });

  test('structured answers override keywords: trigger words in the text do not classify on their own', () => {
    const result = classifyAISystem({ ...base, description: 'Employment recruitment and CV screening of job candidates' });
    expect(result.classification).toBe('MINIMAL_RISK');
    // ...but the contradiction is surfaced
    expect(result.uncertainty?.challengedAnswers.map(c => c.questionId)).toContain('annex3.employment');
  });

  test('Annex III "Yes" gives high risk; exemption applies when a condition is met and there is no risk of harm', () => {
    expect(classifyAISystem(withAnnex3('education', 'yes')).classification).toBe('HIGH_RISK');

    const exempt = classifyAISystem({
      ...withAnnex3('education', 'yes'),
      exemptionAnswers: { ...base.exemptionAnswers, procedural_task: 'yes' },
    });
    expect(exempt.classification).toBe('LIMITED_RISK');
    expect(exempt.exemptionApplied).toBe(true);
  });

  test('Article 5 "Yes" is a fatal violation', () => {
    const result = classifyAISystem({ ...base, article5Answers: { ...base.article5Answers, social_scoring: 'yes' } });
    expect(result.classification).toBe('UNACCEPTABLE_RISK');
    expect(result.violations.map(v => v.id)).toEqual(['social_scoring']);
    expect(result.uncertainty).toBeUndefined();
  });

  test('Annex I "Yes" is high risk', () => {
    expect(classifyAISystem({ ...base, annex1Answer: 'yes' }).classification).toBe('HIGH_RISK');
  });

  test('productType gpai triggers GPAI; the compute threshold makes it systemic', () => {
    const gpai = classifyAISystem({ ...base, productType: 'gpai' });
    expect(gpai.classification).toBe('GPAI');
    const systemic = classifyAISystem({ ...base, productType: 'gpai', gpaiTrainingComputeFLOPs: 1e25 });
    expect(systemic.obligations.some(o => o.startsWith('Article 55'))).toBe(true);
  });

  test('generatesOrInteractsWithPeople drives Article 50', () => {
    expect(classifyAISystem({ ...base, generatesOrInteractsWithPeople: true }).classification).toBe('LIMITED_RISK');
  });
});

describe('pessimistic handling of "unsure"', () => {
  test('Annex III unsure is treated as matched (high risk) and tracked', () => {
    const result = classifyAISystem(withAnnex3('healthcare_ai', 'unsure'));
    expect(result.classification).toBe('HIGH_RISK');
    expect(result.uncertainty?.unsureQuestions.map(q => q.questionId)).toEqual(['annex3.healthcare_ai']);
    expect(result.uncertainty?.worstCaseClassification).toBe('HIGH_RISK');
    expect(result.checklist.some(i => i.title === 'Resolve: Healthcare and Medical AI Systems')).toBe(true);
  });

  test('Annex I unsure is treated as a safety component', () => {
    const result = classifyAISystem({ ...base, annex1Answer: 'unsure' });
    expect(result.classification).toBe('HIGH_RISK');
    expect(result.uncertainty?.unsureQuestions).toHaveLength(1);
  });

  test('significant risk of harm unsure removes the Article 6(3) exemption', () => {
    const result = classifyAISystem({
      ...withAnnex3('education', 'yes'),
      exemptionAnswers: { ...base.exemptionAnswers, procedural_task: 'yes', significantRiskOfHarm: 'unsure' },
    });
    expect(result.classification).toBe('HIGH_RISK');
    expect(result.exemptionApplied).toBe(false);
  });

  test('an unsure Annex III area cannot be exempted from', () => {
    const result = classifyAISystem({
      ...withAnnex3('education', 'unsure'),
      exemptionAnswers: { ...base.exemptionAnswers, procedural_task: 'yes' },
    });
    expect(result.classification).toBe('HIGH_RISK');
  });

  test('a condition answered unsure counts as not met', () => {
    const result = classifyAISystem({
      ...withAnnex3('education', 'yes'),
      exemptionAnswers: { ...base.exemptionAnswers, procedural_task: 'unsure' },
    });
    expect(result.classification).toBe('HIGH_RISK');
  });

  test('Article 5 unsure is not fatal but flags legal review and a worst case of UNACCEPTABLE_RISK', () => {
    const result = classifyAISystem({ ...base, article5Answers: { ...base.article5Answers, social_scoring: 'unsure' } });
    expect(result.classification).toBe('MINIMAL_RISK');
    expect(result.violations).toEqual([]);
    expect(result.uncertainty?.worstCaseClassification).toBe('UNACCEPTABLE_RISK');
    expect(result.uncertainty?.unsureQuestions[0].treatedAs).toMatch(/legal review/i);
  });

  test('each unsure lowers confidence and confidence never drops below 30', () => {
    const none = classifyAISystem(base).confidenceScore;
    const one = classifyAISystem(withAnnex3('education', 'unsure')).confidenceScore;
    expect(one).toBeLessThan(classifyAISystem(withAnnex3('education', 'yes')).confidenceScore);
    expect(none).toBeGreaterThanOrEqual(30);

    const many = classifyAISystem({
      ...base,
      annex1Answer: 'unsure',
      annex3Answers: Object.fromEntries(rules.annexIII.map(c => [c.id, 'unsure'])),
      article5Answers: Object.fromEntries(rules.article5.map(p => [p.id, 'unsure'])),
    });
    expect(many.confidenceScore).toBe(30);
  });
});

describe('challenged "No" answers', () => {
  const recruiting: AssessmentInput = {
    ...base,
    description: 'Automated recruitment tool that ranks candidates from CV screening',
  };

  test('the user\'s "No" still decides the classification but is recorded with its justification', () => {
    const result = classifyAISystem({
      ...recruiting,
      justifications: { 'annex3.employment': 'It only reorders a list that a recruiter then reviews manually.' },
    });
    expect(result.classification).toBe('MINIMAL_RISK');
    const challenged = result.uncertainty?.challengedAnswers ?? [];
    expect(challenged).toHaveLength(1);
    expect(challenged[0].justification).toMatch(/recruiter/);
    expect(result.uncertainty?.worstCaseClassification).toBe('HIGH_RISK');
    expect(result.confidenceScore).toBeLessThan(classifyAISystem(base).confidenceScore);
    expect(result.checklist.some(i => i.title.startsWith('Document evidence supporting "No"'))).toBe(true);
  });

  test('a missing justification is recorded as such', () => {
    const result = classifyAISystem(recruiting);
    expect(result.uncertainty?.challengedAnswers[0].justification).toBe('');
    expect(result.checklist.find(i => i.title.startsWith('Document evidence'))?.description).toMatch(/No justification was recorded/);
  });
});

describe('validation of structured fields', () => {
  test.each([
    ['unknown Article 5 id', { article5Answers: { nonsense: 'no' } }],
    ['invalid answer value', { annex3Answers: { education: 'maybe' } }],
    ['unknown product type', { productType: 'toaster' }],
    ['invalid annex1Answer', { annex1Answer: 'perhaps' }],
    ['unknown exemption key', { exemptionAnswers: { other: 'no' } }],
    ['non-string justification', { justifications: { 'annex3.education': 5 } }],
  ])('rejects %s', (_name, patch) => {
    expect(() => classifyAISystem({ ...base, ...(patch as object) } as AssessmentInput)).toThrow(/Validation failed/);
  });
});
