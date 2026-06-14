// lib/assessment-log.ts
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getRulesVersion } from './classification-engine';

const LOG_FILE = path.join(process.cwd(), 'data', 'assessments.jsonl');

export interface AssessmentRecord {
  id: string;
  timestamp: string;
  systemName: string;
  description: string;
  classification: string;
  confidenceScore: number;
  evidenceStrength: number;
  violations: any[];
  highRiskMatches: any[];
  applicableArticles: string[];
  obligations: string[];
  riskScore?: number;
  reasoning: string;
  rulesVersion: string;
  metadata: {
    industry: string;
    geographies: string[];
    fundamentalRightsImpact: boolean;
    crossBorderImpact: boolean;
  };
}

/**
 * Append assessment to immutable log
 * IMPORTANT: Never delete or modify entries
 * Each entry is immutable once written
 */
export function appendAssessment(assessment: Omit<AssessmentRecord, 'id' | 'timestamp' | 'rulesVersion'>): AssessmentRecord {
  // Ensure data directory exists
  const dataDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Create immutable record
  const record: AssessmentRecord = {
    ...assessment,
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    rulesVersion: getRulesVersion(),
  };

  // Append to log (never overwrite)
  const jsonLine = JSON.stringify(record) + '\n';
  fs.appendFileSync(LOG_FILE, jsonLine, 'utf-8');

  return record;
}

/**
 * Read all assessments from immutable log
 * Returns in order (oldest first)
 * Skips malformed JSON lines gracefully
 */
export function readAllAssessments(): AssessmentRecord[] {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  return content
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error('Error parsing assessment line:', e);
        return null;
      }
    })
    .filter((item): item is AssessmentRecord => item !== null);
}

/**
 * Get single assessment by ID
 */
export function getAssessmentById(id: string): AssessmentRecord | null {
  const all = readAllAssessments();
  const assessment = all.find(a => a.id === id);
  return assessment || null;
}

/**
 * Get latest assessments
 */
export function getLatestAssessments(limit: number = 20): AssessmentRecord[] {
  const all = readAllAssessments();
  return all.slice(-limit).reverse(); // Most recent first
}

/**
 * Search assessments by system name, classification, or description
 * Handles undefined or missing description fields gracefully
 */
export function searchAssessments(query: string): AssessmentRecord[] {
  const all = readAllAssessments();
  const lowerQuery = query.toLowerCase();
  
  return all.filter(a => 
    a.systemName.toLowerCase().includes(lowerQuery) ||
    a.classification.toLowerCase().includes(lowerQuery) ||
    (a.description && a.description.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get statistics
 */
export function getStatistics() {
  const assessments = readAllAssessments();
  
  const stats = {
    totalAssessments: assessments.length,
    byClassification: {
      UNACCEPTABLE_RISK: 0,
      HIGH_RISK: 0,
      LIMITED_RISK: 0,
      MINIMAL_RISK: 0,
      GPAI: 0,
    },
    averageConfidence: 0,
    averageEvidence: 0,
    lastAssessment: null as AssessmentRecord | null,
  };

  let totalConfidence = 0;
  let totalEvidence = 0;

  for (const assessment of assessments) {
    const classification = assessment.classification as keyof typeof stats.byClassification;
    if (classification in stats.byClassification) {
      stats.byClassification[classification]++;
    }
    totalConfidence += assessment.confidenceScore;
    totalEvidence += assessment.evidenceStrength;
  }

  if (assessments.length > 0) {
    stats.averageConfidence = Math.round(totalConfidence / assessments.length);
    stats.averageEvidence = Math.round(totalEvidence / assessments.length);
    stats.lastAssessment = assessments[assessments.length - 1];
  }

  return stats;
}

/**
 * Export assessment history as JSON
 */
export function exportAsJSON(): string {
  const assessments = readAllAssessments();
  return JSON.stringify(assessments, null, 2);
}

/**
 * Export assessment history as CSV
 */
export function exportAsCSV(): string {
  const assessments = readAllAssessments();
  
  if (assessments.length === 0) {
    return '';
  }

  // CSV Header
  const headers = [
    'ID',
    'Timestamp',
    'System Name',
    'Classification',
    'Confidence Score',
    'Evidence Strength',
    'Rules Version',
  ];

  // CSV rows
  const rows = assessments.map(a => [
    a.id,
    a.timestamp,
    a.systemName,
    a.classification,
    a.confidenceScore,
    a.evidenceStrength,
    a.rulesVersion,
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}

/**
 * Get file size and stats
 */
export function getLogStats() {
  if (!fs.existsSync(LOG_FILE)) {
    return {
      filePath: LOG_FILE,
      fileSize: 0,
      fileSize_MB: '0.00',
      entriesCount: 0,
      createdAt: null,
    };
  }

  const stats = fs.statSync(LOG_FILE);
  const entries = readAllAssessments();

  return {
    filePath: LOG_FILE,
    fileSize: stats.size,
    fileSize_MB: (stats.size / 1024 / 1024).toFixed(2),
    entriesCount: entries.length,
    createdAt: stats.birthtime,
    lastModified: stats.mtime,
  };
}