// components/ResultView.tsx
// Full result for one assessment: classification and reasoning, pessimistic outlook,
// applicable articles, governance structure, evidence checklist and PDF download.
// Used by the wizard's final screen and by expanded history rows.
import { Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import ChecklistPanel, { ChecklistItem } from '@/components/ChecklistPanel';
import { getClassificationStyle } from '@/components/classification-styles';

export interface ResultData {
  assessmentId: string;
  systemName?: string;
  classification: string;
  confidenceScore: number;
  evidenceStrength: number;
  reasoning: string;
  violations: { id: string; name: string; article?: string }[];
  applicableArticles: string[];
  governanceRequirements: { role: string; ownerRole: string; reviewCadence: string; escalationTrigger: string }[];
  uncertainty?: {
    unsureQuestions: { questionId: string; label: string; treatedAs: string }[];
    challengedAnswers: { questionId: string; label: string; signals: string[]; justification: string }[];
    worstCaseClassification: string;
    note: string;
  } | null;
  checklist?: ChecklistItem[];
}

const pretty = (s: string) => s.replace(/_/g, ' ');

export default function ResultView({ result }: { result: ResultData }) {
  const style = getClassificationStyle(result.classification);
  const Icon = style.icon;
  const u = result.uncertainty;

  return (
    <div className="space-y-6" data-testid="result-view">
      <Card className={`${style.bg} border-2 ${style.border}`}>
        <CardHeader>
          <CardTitle className={`${style.text} flex items-center gap-2`}>
            <Icon className="w-6 h-6" />
            {pretty(result.classification)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-8">
            <div>
              <p className="text-sm font-medium text-gray-600">Confidence</p>
              <p className="text-2xl font-bold">{Math.round(result.confidenceScore)}%</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Evidence strength</p>
              <p className="text-2xl font-bold">{Math.round(result.evidenceStrength)}%</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Why this classification</p>
            <p className="text-sm mt-1">{result.reasoning}</p>
          </div>
          {result.violations.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Prohibited practices identified</p>
              <ul className="space-y-1 text-sm">
                {result.violations.map(v => (
                  <li key={v.id}>• {v.name}</li>
                ))}
              </ul>
            </div>
          )}
          <a
            href={`/api/systems/${result.assessmentId}/report.pdf`}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
        </CardContent>
      </Card>

      {u && (
        <Card className="border-2 border-amber-300 bg-amber-50" data-testid="pessimistic-outlook">
          <CardHeader>
            <CardTitle className="text-amber-900">Pessimistic outlook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>{u.note}</p>
            <p>
              <span className="font-medium">Worst case:</span> {pretty(u.worstCaseClassification)}
            </p>
            {u.unsureQuestions.length > 0 && (
              <div>
                <p className="font-medium mb-1">Answers marked unsure</p>
                <ul className="space-y-2">
                  {u.unsureQuestions.map(q => (
                    <li key={q.questionId}>
                      <span className="font-medium">{q.label}.</span> {q.treatedAs}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {u.challengedAnswers.length > 0 && (
              <div>
                <p className="font-medium mb-1">"No" answers that conflict with other information</p>
                <ul className="space-y-3">
                  {u.challengedAnswers.map(c => (
                    <li key={c.questionId}>
                      <p className="font-medium">{c.label}</p>
                      {c.signals.map((s, i) => (
                        <p key={i} className="text-xs text-gray-700">
                          Evidence: {s}
                        </p>
                      ))}
                      <p className="text-xs text-gray-700">Justification: {c.justification || 'none recorded'}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-gray-700">
              Resolve these items in the checklist below, then re-run the assessment with the confirmed answers.
            </p>
          </CardContent>
        </Card>
      )}

      {result.applicableArticles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Applicable articles</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.applicableArticles.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-600 font-bold">•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Governance structure</CardTitle>
        </CardHeader>
        <CardContent>
          {result.governanceRequirements.length === 0 ? (
            <p className="text-sm text-gray-600">No governance structure recorded for this assessment.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.governanceRequirements.map(g => (
                <div key={g.role} className="border rounded-lg p-4 text-sm space-y-1">
                  <p className="font-semibold capitalize">{pretty(g.role)}</p>
                  <p>
                    <span className="text-gray-600">Owner:</span> {g.ownerRole}
                  </p>
                  <p>
                    <span className="text-gray-600">Review cadence:</span> {g.reviewCadence}
                  </p>
                  <p>
                    <span className="text-gray-600">Escalate when:</span> {g.escalationTrigger}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ChecklistPanel assessmentId={result.assessmentId} initialItems={result.checklist} />
        </CardContent>
      </Card>
    </div>
  );
}
