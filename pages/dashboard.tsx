// pages/dashboard.tsx - COMPLETE CORRECTED VERSION
'use client';
import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { AlertTriangle, CheckCircle, AlertCircle, Download, BarChart3 } from 'lucide-react';

const classificationStyles: Record<string, any> = {
  UNACCEPTABLE_RISK: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-900',
    badge: 'bg-red-100 text-red-800',
    icon: AlertTriangle,
  },
  HIGH_RISK: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-900',
    badge: 'bg-orange-100 text-orange-800',
    icon: AlertCircle,
  },
  LIMITED_RISK: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    text: 'text-yellow-900',
    badge: 'bg-yellow-100 text-yellow-800',
    icon: AlertCircle,
  },
  MINIMAL_RISK: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-900',
    badge: 'bg-green-100 text-green-800',
    icon: CheckCircle,
  },
  GPAI: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-900',
    badge: 'bg-blue-100 text-blue-800',
    icon: CheckCircle,
  },
};

export default function Dashboard() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('assess');

  const [formData, setFormData] = useState({
    systemName: '',
    description: '',
    industry: 'Healthcare',
    geographies: ['EU'] as string[],
    vulnerableGroups: [] as string[],
    fundamentalRightsImpact: false,
    crossBorderImpact: false,
    riskSeverity: 0,
    riskLikelihood: 0,
  });

  const industries = [
    'Healthcare',
    'Financial Services',
    'Insurance',
    'Government',
    'Education',
    'Employment',
    'Retail',
    'Manufacturing',
  ];

  const geographies = ['EU', 'UK', 'USA', 'Global'];
  const vulnerableGroups = [
    'Children',
    'Patients',
    'Students',
    'Employees',
    'Disabled Persons',
    'Elderly',
  ];

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseInt(value, 10) || 0,
    }));
  };

  const handleGeographyChange = (geo: string) => {
    setFormData(prev => ({
      ...prev,
      geographies: prev.geographies.includes(geo)
        ? prev.geographies.filter(g => g !== geo)
        : [...prev.geographies, geo],
    }));
  };

  const handleGroupChange = (group: string) => {
    setFormData(prev => ({
      ...prev,
      vulnerableGroups: prev.vulnerableGroups.includes(group)
        ? prev.vulnerableGroups.filter(g => g !== group)
        : [...prev.vulnerableGroups, group],
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  // Only submit if the submit button was actually clicked
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement;
  if (!submitter || submitter.getAttribute('type') !== 'submit') {
    e.preventDefault();
    return;
  }

  // Actual form submission logic
  e.preventDefault();
  setIsLoading(true);

  try {
    const res = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      const error = await res.json();
      alert(`Error: ${error.error}\n${error.details || ''}`);
      return;
    }

    const data = await res.json();
    setResult(data.assessment);
    setStep(2);
    loadStats();
    loadHistory();
  } catch (err) {
    console.error('Submission error:', err);
    alert('Failed to submit assessment');
  } finally {
    setIsLoading(false);
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-4xl font-bold mb-2">EU AI Act Compliance Checker</h1>
        <p className="text-gray-600 mb-8">Assess and track AI system risk classifications</p>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b">
          {['assess', 'results', 'history', 'stats'].map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setStep(1);
              }}
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form */}
            <div className="lg:col-span-2">
              {step === 1 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 1: System Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={(e) => {e.preventDefault();
                        handleSubmit(e);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                      className="space-y-6"
                    >
                      {/* System Name */}
                      <div>
                        <Label htmlFor="systemName">System Name *</Label>
                        <Input
                          id="systemName"
                          name="systemName"
                          value={formData.systemName}
                          onChange={handleInputChange}
                          placeholder="e.g., Facial Recognition System"
                          required
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <Label htmlFor="description">Description *</Label>
                        <Textarea
                          id="description"
                          name="description"
                          value={formData.description}
                          onChange={handleInputChange}
                          placeholder="Describe the AI system and its purpose"
                          required
                          rows={4}
                        />
                      </div>

                      {/* Industry */}
                      <div>
                        <Label htmlFor="industry">Industry *</Label>
                        <Select 
                          value={formData.industry} 
                          onValueChange={(value) => {
                            setFormData(prev => ({ ...prev, industry: value }));
                          }}
                        >
                          <SelectTrigger 
                            id="industry"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {industries.map(ind => (
                              <SelectItem key={ind} value={ind}>
                                {ind}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Geographies */}
                      <div>
                        <Label>Geographies *</Label>
                        <div className="space-y-2 mt-2">
                          {geographies.map(geo => (
                            <label key={geo} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={formData.geographies.includes(geo)}
                                onChange={() => handleGeographyChange(geo)}
                                className="w-4 h-4"
                              />
                              {geo}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Vulnerable Groups */}
                      <div>
                        <Label>Vulnerable Groups</Label>
                        <div className="space-y-2 mt-2">
                          {vulnerableGroups.map(group => (
                            <label key={group} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={formData.vulnerableGroups.includes(group)}
                                onChange={() => handleGroupChange(group)}
                                className="w-4 h-4"
                              />
                              {group}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Fundamental Rights Impact */}
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="fundamentalRightsImpact"
                          checked={formData.fundamentalRightsImpact}
                          onChange={handleInputChange}
                          className="w-4 h-4"
                        />
                        May impact fundamental rights
                      </label>

                      {/* Cross-Border Impact */}
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="crossBorderImpact"
                          checked={formData.crossBorderImpact}
                          onChange={handleInputChange}
                          className="w-4 h-4"
                        />
                        May have cross-border impact
                      </label>

                      {/* Risk Scores */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="riskSeverity">Risk Severity (1-5)</Label>
                          <Input
                            id="riskSeverity"
                            name="riskSeverity"
                            type="number"
                            min="0"
                            max="5"
                            value={formData.riskSeverity}
                            onChange={handleNumberChange}
                          />
                        </div>
                        <div>
                          <Label htmlFor="riskLikelihood">Risk Likelihood (1-5)</Label>
                          <Input
                            id="riskLikelihood"
                            name="riskLikelihood"
                            type="number"
                            min="0"
                            max="5"
                            value={formData.riskLikelihood}
                            onChange={handleNumberChange}
                          />
                        </div>
                      </div>

                      <Button type="submit" disabled={isLoading} className="w-full">
                        {isLoading ? 'Classifying...' : 'Classify System →'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 2: Assessment Complete</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      onClick={() => {
                        setStep(1);
                        setFormData({
                          systemName: '',
                          description: '',
                          industry: 'Healthcare',
                          geographies: ['EU'],
                          vulnerableGroups: [],
                          fundamentalRightsImpact: false,
                          crossBorderImpact: false,
                          riskSeverity: 0,
                          riskLikelihood: 0,
                        });
                        setResult(null);
                      }}
                      className="w-full"
                    >
                      New Assessment
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Results Panel */}
            {result && (
              <div className="lg:col-span-1">
                <Card className={`${classificationStyles[result.classification].bg} border-2 ${classificationStyles[result.classification].border}`}>
                  <CardHeader>
                    <CardTitle className={classificationStyles[result.classification].text}>
                      {result.classification}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Confidence Score</p>
                      <p className="text-2xl font-bold">{result.confidenceScore}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Evidence Strength</p>
                      <p className="text-2xl font-bold">{result.evidenceStrength}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Reasoning</p>
                      <p className="text-sm mt-2">{result.reasoning}</p>
                    </div>
                    {result.violations.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-2">Violations</p>
                        <ul className="space-y-1">
                          {result.violations.map((v: any) => (
                            <li key={v.id} className="text-sm">{v.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.obligations.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-2">Key Obligations</p>
                        <ul className="space-y-1 text-sm">
                          {result.obligations.slice(0, 3).map((ob: string, i: number) => (
                            <li key={i}>• {ob}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* RESULTS TAB */}
        {activeTab === 'results' && result && (
          <Card>
            <CardHeader>
              <CardTitle>Detailed Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className={`p-6 rounded-lg ${classificationStyles[result.classification].bg}`}>
                <h2 className={`text-2xl font-bold ${classificationStyles[result.classification].text} mb-4`}>
                  {result.classification}
                </h2>
                <p className="text-lg mb-4">{result.reasoning}</p>
              </div>

              {/* Applicable Articles */}
              {result.applicableArticles.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Applicable Articles</h3>
                  <ul className="space-y-2">
                    {result.applicableArticles.map((article: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>{article}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Obligations */}
              {result.obligations.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Compliance Obligations</h3>
                  <ul className="space-y-2">
                    {result.obligations.map((ob: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{ob}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <Card>
            <CardHeader>
              <CardTitle>Assessment History</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-gray-600">No assessments yet</p>
              ) : (
                <div className="space-y-3">
                  {history.map(assessment => (
                    <div key={assessment.id} className="flex justify-between items-start p-3 border rounded-lg">
                      <div>
                        <p className="font-semibold">{assessment.systemName}</p>
                        <p className="text-sm text-gray-600">{new Date(assessment.timestamp).toLocaleString()}</p>
                      </div>
                      <span className={`px-3 py-1 rounded text-sm ${classificationStyles[assessment.classification].badge}`}>
                        {assessment.classification}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
