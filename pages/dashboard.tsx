// pages/dashboard.tsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { requireAuthSSR, type AuthedUser } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import ResultView, { ResultData } from '@/components/ResultView';
import { getClassificationStyle } from '@/components/classification-styles';
import { Download, ChevronDown, ChevronUp } from 'lucide-react';

export const getServerSideProps: GetServerSideProps = async (ctx) => requireAuthSSR(ctx);

// GET /api/systems/:id returns a SystemReport; ResultView takes the flatter result shape
function reportToResult(report: any): ResultData {
  const a = report.assessment;
  return {
    assessmentId: a.id,
    systemName: a.systemName,
    classification: a.classification,
    confidenceScore: a.confidenceScore,
    evidenceStrength: a.evidenceStrength,
    reasoning: a.reasoning,
    violations: a.violations ?? [],
    applicableArticles: a.applicableArticles ?? [],
    governanceRequirements: report.governanceRequirements ?? [],
    uncertainty: report.uncertainty,
    checklist: report.checklist,
    australia: report.australia,
  };
}

function HistoryDetail({ id }: { id: string }) {
  const [result, setResult] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/systems/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load assessment');
        if (!cancelled) setResult(reportToResult(data));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load assessment');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="mt-2 text-sm text-red-700">{error}</p>;
  if (!result) return <p className="mt-2 text-sm text-gray-600">Loading...</p>;
  return (
    <div className="mt-3">
      <ResultView result={result} />
    </div>
  );
}

export default function Dashboard({ user }: { user: AuthedUser }) {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('assess');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // Load stats and history on mount
  useEffect(() => {
    loadStats();
    loadHistory();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/assessments?action=stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/assessments?action=latest&limit=10');
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const exportData = async (format: 'json' | 'csv') => {
    try {
      const res = await fetch(`/api/assessments?action=export&format=${format}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assessments.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export data');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-4xl font-bold">EU AI Act Compliance Checker</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">{user.email}</span>
            {user.isSeedUser && (
              <Link href="/admin/users" className="text-blue-700 hover:underline">
                Manage users
              </Link>
            )}
            <button onClick={handleLogout} className="text-gray-600 hover:text-gray-900 hover:underline">
              Log out
            </button>
          </div>
        </div>
        <p className="text-gray-600 mb-8">Assess and track AI system risk classifications</p>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b">
          {['assess', 'history', 'stats'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium capitalize ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ASSESS TAB */}
        {activeTab === 'assess' && (
          <Card>
            <CardHeader>
              <CardTitle>Assess an AI system</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                A guided questionnaire walks through scope, your role, high-risk areas, prohibited practices and the Article 6(3) exemption. Progress is
                saved automatically, so you can leave and resume later.
              </p>
              <Link
                href="/assess"
                className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
              >
                Start an assessment
              </Link>
            </CardContent>
          </Card>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Assessment History</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-gray-600">No assessments yet</p>
                ) : (
                  <div className="space-y-3">
                    {history.map(assessment => {
                      const open = selectedHistoryId === assessment.id;
                      return (
                        <div key={assessment.id}>
                          <button
                            onClick={() => setSelectedHistoryId(open ? null : assessment.id)}
                            className="w-full text-left flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition"
                          >
                            <div>
                              <p className="font-semibold">{assessment.systemName}</p>
                              <p className="text-sm text-gray-600">{new Date(assessment.timestamp).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1 rounded text-sm ${getClassificationStyle(assessment.classification).badge}`}>
                                {assessment.classification}
                              </span>
                              {open ? (
                                <ChevronUp className="w-5 h-5 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                          </button>
                          {open && <HistoryDetail id={assessment.id} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* STATS TAB */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {stats && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-gray-600">Total Assessments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{stats.totalAssessments}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-gray-600">Unacceptable Risk</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-red-600">{stats.byClassification.UNACCEPTABLE_RISK}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-gray-600">High Risk</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-orange-600">{stats.byClassification.HIGH_RISK}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-gray-600">Limited Risk</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-yellow-600">{stats.byClassification.LIMITED_RISK}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-gray-600">Avg Confidence</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-blue-600">{stats.averageConfidence}%</p>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Export Section */}
            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle>Export Data</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <Button onClick={() => exportData('json')} variant="outline" className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Export JSON
                </Button>
                <Button onClick={() => exportData('csv')} variant="outline" className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
