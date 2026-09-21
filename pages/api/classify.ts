// pages/api/classify.ts - CORRECTED VERSION
import type { NextApiRequest, NextApiResponse } from 'next';
import { classifyAISystem, AssessmentInput, ClassificationResult } from '@/lib/classification-engine';
import { appendAssessment } from '@/lib/assessment-log';
import { getChecklistForAssessment } from '@/lib/checklist';
import { RISK_LABELS, getRiskOverrides, sanitizeAnswers } from '@/lib/assessment-flow';
import { assessAlignment, isAustraliaSelected } from '@/lib/australia-alignment';
import { updateQASessionForActor } from '@/lib/qa-sessions';
import { requireAuth } from '@/lib/auth';

type ResponseData = 
  | ClassificationResult 
  | { error: string; details?: string }
  | { success: boolean; assessment: any };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed. Use POST.'
    });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const input: AssessmentInput = req.body;

    // Validate input
    if (!input) {
      return res.status(400).json({
        error: 'Request body is required'
      });
    }

    // Immutable snapshot of what was submitted (known keys only), for history and the PDF
    const answers = sanitizeAnswers(req.body);

    // A risk rating that differs from the system suggestion must carry a written reason
    const badOverrides = getRiskOverrides(answers).filter(o => !o.valid);
    if (badOverrides.length > 0) {
      return res.status(400).json({
        error: 'Changing a suggested risk rating requires a reason',
        details: badOverrides.map(o => RISK_LABELS[o.key]).join(', '),
      });
    }

    // Classify the AI system
    const classificationResult = classifyAISystem(input);

    // Australia mapping runs only when Australia was selected and its questions were answered
    const australia =
      isAustraliaSelected(answers.geographies) && answers.australiaAnswers
        ? assessAlignment({ answers, classification: classificationResult.classification, obligations: classificationResult.obligations })
        : null;

    // Store in assessment log
    const assessment = await appendAssessment({
      systemName: input.systemName,
      description: input.description,
      classification: classificationResult.classification,
      confidenceScore: classificationResult.confidenceScore,
      evidenceStrength: classificationResult.evidenceStrength,
      violations: classificationResult.violations,
      highRiskMatches: [
        ...classificationResult.annex1Matches,
        ...classificationResult.annex3Matches,
      ],
      applicableArticles: classificationResult.applicableArticles,
      obligations: classificationResult.obligations,
      riskScore: classificationResult.riskScore,
      reasoning: classificationResult.reasoning,
      metadata: {
        industry: input.industry,
        geographies: input.geographies,
        fundamentalRightsImpact: input.fundamentalRightsImpact,
        crossBorderImpact: input.crossBorderImpact,
      },
    }, {
      actorId: user.id,
      checklistDrafts: [...classificationResult.checklist, ...(australia?.checklist ?? [])],
      answers,
    });

    // Best effort: mark the draft this assessment came from as submitted
    const { sessionId } = req.body as { sessionId?: unknown };
    if (typeof sessionId === 'string') {
      try {
        await updateQASessionForActor(sessionId, user.id, {
          answers: answers as Record<string, unknown>,
          currentStep: 'submitted',
        });
      } catch (sessionError) {
        console.error('Could not mark session as submitted:', sessionError);
      }
    }

    const checklist = await getChecklistForAssessment(assessment.id);

    return res.status(200).json({
      success: true,
      assessment: {
        ...classificationResult,
        assessmentId: assessment.id,
        checklist,
        australia,
      },
    });
  } catch (error) {
    console.error('Classification error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Validation failed')) {
        return res.status(400).json({ 
          error: error.message,
          details: 'Please check all required fields are filled correctly',
        });
      }

      return res.status(500).json({ 
        error: 'Classification failed',
        details: error.message,
      });
    }

    return res.status(500).json({ 
      error: 'An unexpected error occurred' 
    });
  }
}
