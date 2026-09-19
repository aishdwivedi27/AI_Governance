// components/ChecklistPanel.tsx
// Evidence checklist with editable status / owner / evidence link, saved through
// PATCH /api/systems/:id/checklist/:itemId (which also writes the audit event).
import { useCallback, useEffect, useState } from 'react';
import { Button, Input } from '@/components/ui';

export interface ChecklistItem {
  id: string;
  obligationArticle: string;
  title: string;
  description: string;
  requiredArtifact: string;
  status: string;
  owner: string | null;
  evidenceLink: string | null;
  lastUpdated: string;
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'not_applicable', label: 'Not applicable' },
];

const STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  complete: 'bg-green-100 text-green-800',
  not_applicable: 'bg-slate-100 text-slate-600',
};

function ChecklistRow({
  assessmentId,
  item,
  onSaved,
}: {
  assessmentId: string;
  item: ChecklistItem;
  onSaved: (item: ChecklistItem) => void;
}) {
  const [owner, setOwner] = useState(item.owner ?? '');
  const [link, setLink] = useState(item.evidenceLink ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Record<string, string | null>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/systems/${assessmentId}/checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSaved(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const ownerChanged = owner.trim() !== (item.owner ?? '');
  const linkChanged = link.trim() !== (item.evidenceLink ?? '');

  return (
    <li className="border rounded-lg p-4 bg-white space-y-3" data-testid="checklist-item">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-blue-700">{item.obligationArticle}</p>
          <p className="font-medium">{item.title}</p>
          <p className="text-xs text-gray-600 mt-1">Required artifact: {item.requiredArtifact}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLE[item.status] ?? STATUS_STYLE.not_started}`}>
          {STATUS_OPTIONS.find(o => o.value === item.status)?.label ?? item.status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-xs text-gray-600">
          Status
          <select
            aria-label={`Status for ${item.title}`}
            className="mt-1 block w-full h-10 rounded-md border border-gray-200 bg-white px-2 text-sm"
            value={item.status}
            disabled={saving}
            onChange={e => save({ status: e.target.value })}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Owner
          <div className="flex gap-2 mt-1">
            <Input
              aria-label={`Owner for ${item.title}`}
              value={owner}
              onChange={e => setOwner(e.target.value)}
              placeholder="Unassigned"
            />
            {ownerChanged && (
              <Button size="sm" disabled={saving} onClick={() => save({ owner: owner.trim() || null })}>
                Save
              </Button>
            )}
          </div>
        </label>
        <label className="text-xs text-gray-600">
          Evidence link
          <div className="flex gap-2 mt-1">
            <Input
              aria-label={`Evidence link for ${item.title}`}
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://..."
            />
            {linkChanged && (
              <Button size="sm" disabled={saving} onClick={() => save({ evidenceLink: link.trim() || null })}>
                Save
              </Button>
            )}
          </div>
        </label>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-gray-500">Last updated {new Date(item.lastUpdated).toLocaleString()}</p>
    </li>
  );
}

export default function ChecklistPanel({
  assessmentId,
  initialItems,
}: {
  assessmentId: string;
  initialItems?: ChecklistItem[];
}) {
  const [items, setItems] = useState<ChecklistItem[] | null>(initialItems ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/systems/${assessmentId}/checklist`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load checklist');
      setItems(data.checklist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checklist');
    }
  }, [assessmentId]);

  useEffect(() => {
    if (!initialItems) load();
  }, [initialItems, load]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!items) return <p className="text-sm text-gray-600">Loading checklist...</p>;
  if (items.length === 0) return <p className="text-sm text-gray-600">No checklist items for this classification.</p>;

  const done = items.filter(i => i.status === 'complete' || i.status === 'not_applicable').length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {done} of {items.length} items complete or not applicable
      </p>
      <ul className="space-y-3">
        {items.map(item => (
          <ChecklistRow
            key={item.id}
            assessmentId={assessmentId}
            item={item}
            onSaved={saved => setItems(prev => (prev ?? []).map(i => (i.id === saved.id ? saved : i)))}
          />
        ))}
      </ul>
    </div>
  );
}
