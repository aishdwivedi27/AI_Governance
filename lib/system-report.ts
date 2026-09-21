// lib/system-report.ts
// Everything the result view, history view and PDF need about one saved assessment,
// assembled from live database state at request time.
import { getAssessmentById, AssessmentRecord } from './assessment-log';
import { getChecklistForAssessment } from './checklist';
import {
  computeUncertainty,
  getGovernanceRequirements,
  getWizardRules,
  EvidenceChecklistItem,
  GovernanceRequirement,
  RiskClassification,
  Uncertainty,
  WizardRules,
} from './classification-engine';
import type { WizardAnswers } from './assessment-flow';
import { assessAlignment, isAustraliaSelected, AustraliaAlignment } from './australia-alignment';

export interface SystemReport {
  assessment: AssessmentRecord;
  answers: WizardAnswers | null;
  /** Present only when Australia was a selected geography and its questions were answered. */
  australia?: AustraliaAlignment | null;
  governanceRequirements: GovernanceRequirement[];
  uncertainty: Uncertainty | null;
  checklist: EvidenceChecklistItem[];
  rules: WizardRules;
}

export async function getSystemReport(assessmentId: string): Promise<SystemReport | null> {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) return null;

  const checklist = await getChecklistForAssessment(assessmentId);
  const answers = assessment.answers ?? null;
  const classification = assessment.classification as RiskClassification;

  return {
    assessment,
    answers,
    // Derived, like governance: the answers snapshot and the stored classification/obligations are the inputs.
    australia:
      answers && isAustraliaSelected(answers.geographies) && answers.australiaAnswers
        ? assessAlignment({ answers, classification, obligations: assessment.obligations })
        : null,
    // Not stored on the record: derived from the classification and the roles that were answered.
    governanceRequirements: answers?.role?.length ? getGovernanceRequirements(classification, answers.role) : [],
    uncertainty: answers ? computeUncertainty(answers, classification) ?? null : null,
    checklist,
    rules: getWizardRules(),
  };
}
