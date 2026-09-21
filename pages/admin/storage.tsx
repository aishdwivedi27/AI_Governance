// pages/admin/storage.tsx
// Seed-user-only UI: see how much of the free-tier database is used, download records as PDF,
// and delete records individually or everything before a date.
'use client';
import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Label } from '@/components/ui';
import { requireAuthSSR, type AuthedUser } from '@/lib/auth';
import { getClassificationStyle } from '@/components/classification-styles';
import AppHeader from '@/components/AppHeader';
import { Download } from 'lucide-react';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const result = await requireAuthSSR(ctx);
  if ('redirect' in result) return result;
  if (!result.props.user.isSeedUser) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return result;
};

interface Usage {
  usedBytes: number;
  capacityBytes: number;
  usedPercent: number;
  tables: { name: string; rows: number; bytes: number }[];
}
interface RecordRow {
  id: string;
  systemName: string;
  classification: string;
  timestamp: string;
}
interface Counts {
  assessments: number;
  checklistItems: number;
  auditEvents: number;
  draftSessions: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function AdminStorage({ user }: { user: AuthedUser }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [before, setBefore] = useState('');
  const [preview, setPreview] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/storage');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load storage details');
      setUsage(data.usage);
      setRecords(data.records);
      setTotal(data.total);
      setSelected([]);
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not load storage details' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A preview describes one specific date; changing the date invalidates it.
  useEffect(() => setPreview(null), [before]);

  // Midnight at the START of the chosen day, in UTC: "before 1 March" keeps everything from 1 March on.
  const beforeIso = before ? new Date(`${before}T00:00:00Z`).toISOString() : '';

  const post = async (body: object) => {
    const res = await fetch('/api/admin/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data.counts as Counts;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  };

  const previewByDate = () => run(async () => setPreview(await post({ before: beforeIso, dryRun: true })));

  const describe = (c: Counts) =>
    `${c.assessments} assessment${c.assessments === 1 ? '' : 's'}, ${c.checklistItems} checklist item${
      c.checklistItems === 1 ? '' : 's'
    }, ${c.auditEvents} audit event${c.auditEvents === 1 ? '' : 's'} and ${c.draftSessions} draft${
      c.draftSessions === 1 ? '' : 's'
    }`;

  const deleteByDate = () =>
    run(async () => {
      if (!preview) return;
      if (!window.confirm(`Permanently delete ${describe(preview)} from before ${before}? This cannot be undone.`)) return;
      const counts = await post({ before: beforeIso });
      setMessage({ kind: 'ok', text: `Deleted ${describe(counts)}.` });
      setPreview(null);
      await load();
    });

  const deleteSelected = () =>
    run(async () => {
      if (!window.confirm(`Permanently delete ${selected.length} selected record(s), including their checklists and audit history? This cannot be undone.`))
        return;
      const counts = await post({ ids: selected });
      setMessage({ kind: 'ok', text: `Deleted ${describe(counts)}.` });
      await load();
    });

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const meterColor = !usage
    ? 'bg-blue-600'
    : usage.usedPercent >= 90
    ? 'bg-red-500'
    : usage.usedPercent >= 70
    ? 'bg-amber-500'
    : 'bg-blue-600';

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Storage | AI Governance</title>
      </Head>
      <AppHeader user={user} />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Storage</h1>
          <p className="mt-1 text-gray-600">Keep the free-tier database under its limit by exporting and deleting old records.</p>
        </div>

        {message && (
          <div
            role="alert"
            className={`rounded-md border px-4 py-2 text-sm ${
              message.kind === 'error' ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Database usage</CardTitle>
            <CardDescription>Counts the whole database, including indexes, as Supabase does for the free-tier quota.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!usage ? (
              <p className="text-sm text-gray-600">Loading...</p>
            ) : (
              <>
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-3xl font-bold">{usage.usedPercent}%</p>
                    <p className="text-sm text-gray-600">
                      {formatBytes(usage.usedBytes)} of {formatBytes(usage.capacityBytes)} used
                    </p>
                  </div>
                  <div
                    className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200"
                    role="progressbar"
                    aria-valuenow={usage.usedPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Database used"
                  >
                    <div className={`h-full ${meterColor}`} style={{ width: `${usage.usedPercent}%` }} />
                  </div>
                  {usage.usedPercent >= 70 && (
                    <p className="mt-2 text-sm text-amber-800">
                      {usage.usedPercent >= 90 ? 'Almost full.' : 'Getting full.'} Export and delete old records below.
                    </p>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-2 font-medium">Table</th>
                      <th className="py-2 text-right font-medium">Rows</th>
                      <th className="py-2 text-right font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.tables.map((t) => (
                      <tr key={t.name} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{t.name}</td>
                        <td className="py-2 text-right">{t.rows.toLocaleString()}</td>
                        <td className="py-2 text-right">{formatBytes(t.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delete records before a date</CardTitle>
            <CardDescription>
              Removes assessments dated before the chosen day, with their checklists, audit history and unfinished drafts. Download the backup first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="before">Delete records before</Label>
                <Input id="before" type="date" max={today()} value={before} onChange={(e) => setBefore(e.target.value)} />
              </div>
              <Button variant="outline" onClick={previewByDate} disabled={!before || busy}>
                Preview
              </Button>
              {before && (
                <a
                  href={`/api/admin/backup.pdf?before=${encodeURIComponent(beforeIso)}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-medium hover:bg-gray-100"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download backup PDF
                </a>
              )}
            </div>
            {preview && (
              <div className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p>
                  This will delete {describe(preview)}.
                  {preview.assessments > 100 && ' The backup PDF holds the oldest 100 records only.'}
                </p>
                <Button variant="destructive" onClick={deleteByDate} disabled={busy || preview.assessments + preview.draftSessions === 0}>
                  Delete permanently
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Records</CardTitle>
            <CardDescription>
              {total === 0
                ? 'No records stored.'
                : `Showing the oldest ${records.length} of ${total} record${total === 1 ? '' : 's'}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {records.length > 0 && (
              <>
                <div className="divide-y divide-gray-200 rounded-md border">
                  {records.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selected.includes(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`Select ${r.systemName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.systemName}</p>
                        <p className="text-xs text-gray-500">{new Date(r.timestamp).toLocaleString()}</p>
                      </div>
                      <span className={`hidden whitespace-nowrap rounded px-2 py-0.5 text-xs sm:inline ${getClassificationStyle(r.classification).badge}`}>
                        {r.classification.replace(/_/g, ' ')}
                      </span>
                      <a
                        href={`/api/systems/${r.id}/report.pdf`}
                        className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        PDF
                      </a>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="destructive" onClick={deleteSelected} disabled={selected.length === 0 || busy}>
                    Delete selected{selected.length > 0 ? ` (${selected.length})` : ''}
                  </Button>
                  <button
                    type="button"
                    className="text-sm text-blue-700 hover:underline"
                    onClick={() => setSelected(selected.length === records.length ? [] : records.map((r) => r.id))}
                  >
                    {selected.length === records.length ? 'Clear selection' : 'Select all shown'}
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
