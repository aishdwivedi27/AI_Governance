// pages/api/assessments/route.ts - CORRECTED VERSION
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  readAllAssessments,
  getAssessmentById,
  getLatestAssessments,
  searchAssessments,
  getStatistics,
  exportAsJSON,
  exportAsCSV,
  getLogStats,
} from '@/lib/assessment-log';

type ResponseData = any;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed. Use GET.' 
    });
  }

  try {
    const { action, id, limit, query, format } = req.query;

    switch (action) {
      case 'all':
        return res.status(200).json(readAllAssessments());

      case 'latest':
        const limitNum = limit ? parseInt(limit as string, 10) : 20;
        return res.status(200).json(getLatestAssessments(limitNum));

      case 'by-id':
        if (!id) {
          return res.status(400).json({ error: 'ID parameter is required' });
        }
        const assessment = getAssessmentById(id as string);
        if (!assessment) {
          return res.status(404).json({ error: 'Assessment not found' });
        }
        return res.status(200).json(assessment);

      case 'search':
        if (!query) {
          return res.status(400).json({ error: 'Query parameter is required' });
        }
        return res.status(200).json(searchAssessments(query as string));

      case 'stats':
        return res.status(200).json(getStatistics());

      case 'export':
        const exportFormat = format || 'json';
        if (exportFormat === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="assessments.csv"');
          return res.status(200).send(exportAsCSV());
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="assessments.json"');
          return res.status(200).send(exportAsJSON());
        }

      case 'log-stats':
        return res.status(200).json(getLogStats());

      default:
        return res.status(400).json({ 
          error: 'Unknown action',
          availableActions: [
            'all',
            'latest',
            'by-id',
            'search',
            'stats',
            'export',
            'log-stats',
          ],
        });
    }
  } catch (error) {
    console.error('API error:', error);

    if (error instanceof Error) {
      return res.status(500).json({ 
        error: 'Request failed',
        message: error.message,
      });
    }

    return res.status(500).json({ 
      error: 'An unexpected error occurred' 
    });
  }
}
