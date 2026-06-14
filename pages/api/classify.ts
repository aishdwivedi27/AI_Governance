// pages/api/classify.ts - CORRECTED VERSION
import type { NextApiRequest, NextApiResponse } from 'next';
import { classifyAISystem, AssessmentInput, ClassificationResult } from '@/lib/classification-engine';
import { appendAssessment } from '@/lib/assessment-log';

type ResponseData = 
  | ClassificationResult 
  | { error: string; details?: string }
  | { success: boolean; assessment: any };

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    const input: AssessmentInput = req.body;

    // Validate input
    if (!input) {
      return res.status(400).json({ 
        error: 'Request body is required' 
      });
    }

    // Classify the AI system
    const classificationResult = classifyAISystem(input);

    // Store in assessment log
    const assessment = appendAssessment({
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
    });

    return res.status(200).json({
      success: true,
      assessment: {
        ...classificationResult,
        assessmentId: assessment.id,
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
