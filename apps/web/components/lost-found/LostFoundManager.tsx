'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LOST_FOUND_BOXES } from '@/lib/lostFoundBoxes';

type Lf = {
  id: string;
  description: string;
  status: 'FOUND' | 'STORED' | 'CLAIMED' | 'CLOSED';
  foundAt: string | null;
  storedAt: string | null;
  guestContactedAt: string | null;
  storedLocation: string | null;
  photoS3Key: string | null;
  photoUrl?: string | null;
  createdAt: string;
  room: { roomNumber: string } | null;
  reportedBy?: { name?: string | null; email?: string | null } | null;
};

type Tab = 'unsorted' | 'stored' | 'archive';

const STATUSES = ['FOUND', 'STORED', 'CLAIMED', 'CLOSED'] as const;

export function LostFoundManager({
  title = 'Lost & found',
  subtitle = 'Triage cleaner reports, manage storage boxes, and track items through to claim.',
}: {
  title?: string;
  subtitle?: string;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('unsorted');
  const [q, setQ] = useState('');
  const [boxFilter, setBoxFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['lost-found', q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const s = params.toString();
      return api<Lf[]>(`/lost-found${s ? `?${s}` : ''}`);
    },
  });

  const items = useMemo(() => {
    const sorted = [...raw].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (tab === 'unsorted') {
      return sorted.filter((i) => i.status === 'FOUND' && !i.storedAt);
    }
    if (tab === 'stored') {
      return sorted.filter(
        (i) => i.status === 'STORED' && (!boxFilter || i.storedLocation === boxFilter),
      );
    }
    return sorted.filter((i) => i.status === 'CLAIMED' || i.status === 'CLOSED');
  }, [raw, tab, boxFilter]);

  const counts = useMemo(() => {
    return {
      unsorted: raw.filter((i) => i.status === 'FOUND' && !i.storedAt).length,
      stored: raw.filter((i) => i.status === 'STORED').length,
      archive: raw.filter((i) => i.status === 'CLAIMED' || i.status === 'CLOSED').length,
    };
  }, [raw]);

  const boxCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of raw) {
      if (i.status === 'STORED' && i.storedLocation) {
        map.set(i.storedLocation, (map.get(i.storedLocation) ?? 0) + 1);
      }
    }
    return map;
  }, [raw]);

  const patch = useMutation({
    mutationFn: (payload: { id: string; body: Record<string, unknown> }) =>
      api<Lf>(`/lost-found/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lost-found'] }),
  });

  const selected = useMemo(
    () => raw.find((i) => i.id === selectedId) ?? null,
    [raw, selectedId],
  );

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        <Button variant="action" onClick={() => setAddOpen(true)}>
          + Add item
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <TabButton active={tab === 'unsorted'} onClick={() => setTab('unsorted')} label="Not sorted" count={counts.unsorted} />
        <TabButton active={tab === 'stored'} onClick={() => setTab('stored')} label="In storage" count={counts.stored} />
        <TabButton active={tab === 'archive'} onClick={() => setTab('archive')} label="Claimed / closed" count={counts.archive} />
        <div className="ml-auto flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Search description…"
            className="min-h-[36px] w-56 rounded-btn border border-border bg-surface px-3 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {tab === 'stored' && (
            <select
              className="min-h-[36px] rounded-btn border border-border bg-surface px-2 text-sm"
              value={boxFilter}
              onChange={(e) => setBoxFilter(e.target.value)}
            >
              <option value="">All boxes</option>
              {LOST_FOUND_BOXES.map((b) => (
                <option key={b} value={b}>
                  {b} ({boxCounts.get(b) ?? 0})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      {tab === 'unsorted' && (
        <UnsortedList
          items={items}
          onOpen={(id) => setSelectedId(id)}
          onStore={(id, box) => patch.mutate({ id, body: { status: 'STORED', storedLocation: box } })}
          pending={patch.isPending}
        />
      )}

      {tab === 'stored' && <StoredGrid items={items} onOpen={(id) => setSelectedId(id)} />}

      {tab === 'archive' && <StoredGrid items={items} onOpen={(id) => setSelectedId(id)} showStatus />}

      {items.length === 0 && !isLoading && (
        <p className="text-sm text-ink-muted">
          {tab === 'unsorted'
            ? 'Nothing to sort. New items from housekeepers will appear here.'
            : tab === 'stored'
              ? 'No items currently in storage.'
              : 'Archive is empty.'}
        </p>
      )}

      {selected && (
        <ItemDetailModal
          item={selected}
          onClose={() => setSelectedId(null)}
          onPatch={(body) => patch.mutate({ id: selected.id, body })}
          pending={patch.isPending}
        />
      )}

      {addOpen && <AddItemModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-muted'
      }`}
    >
      {label}{' '}
      <span
        className={`ml-1 inline-flex min-w-[22px] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
          active ? 'bg-white/20 text-white' : 'bg-surface-muted text-ink-muted'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function UnsortedList({
  items,
  onOpen,
  onStore,
  pending,
}: {
  items: Lf[];
  onOpen: (id: string) => void;
  onStore: (id: string, box: string) => void;
  pending: boolean;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted"
            >
              {item.photoUrl ? (
                <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] text-ink-muted">No photo</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="min-w-[200px] flex-1 text-left"
            >
              <p className="font-medium text-ink">{item.description}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {item.room ? `Room ${item.room.roomNumber}` : 'No room'}
                {item.reportedBy?.name ? ` · Reported by ${item.reportedBy.name}` : ''}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Found: {item.foundAt ? new Date(item.foundAt).toLocaleString() : 'Not reported'}
              </p>
            </button>
            <BoxPicker
              disabled={pending}
              placeholder="Store in box…"
              value=""
              onChange={(box) => onStore(item.id, box)}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}

function StoredGrid({
  items,
  onOpen,
  showStatus,
}: {
  items: Lf[];
  onOpen: (id: string) => void;
  showStatus?: boolean;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className="group block w-full overflow-hidden rounded-card border border-border bg-surface text-left shadow-card transition hover:shadow-lift"
          >
            <div className="flex aspect-[4/3] items-center justify-center bg-surface-muted text-ink-muted">
              {item.photoUrl ? (
                <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs">No photo</span>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium leading-snug text-ink">{item.description}</p>
                {item.storedLocation && (
                  <span className="rounded-md bg-action/10 px-2 py-0.5 text-xs font-semibold text-action">
                    {item.storedLocation}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Stored: {item.storedAt ? new Date(item.storedAt).toLocaleString() : '—'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Guest contacted: {item.guestContactedAt ? 'Yes' : 'No'}
              </p>
              {showStatus && (
                <span className="mt-3 inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium capitalize text-ink-muted">
                  {item.status.toLowerCase()}
                </span>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BoxPicker({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      disabled={disabled}
      value={value}
      onChange={(e) => {
        if (e.target.value) onChange(e.target.value);
      }}
      className="min-h-[40px] rounded-btn border border-border bg-surface px-3 text-sm"
    >
      <option value="">{placeholder ?? 'Select box…'}</option>
      {LOST_FOUND_BOXES.map((b) => (
        <option key={b} value={b}>
          Box {b}
        </option>
      ))}
    </select>
  );
}

function ItemDetailModal({
  item,
  onClose,
  onPatch,
  pending,
}: {
  item: Lf;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-card border border-border bg-surface shadow-lift sm:rounded-card">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Lost & found item</h2>
            <p className="mt-1 text-xs text-ink-muted capitalize">Status: {item.status.toLowerCase()}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-surface-muted"
          >
            Close
          </button>
        </div>
        <div className="grid gap-6 p-5 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-card bg-surface-muted">
              {item.photoUrl ? (
                <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm text-ink-muted">No photo</span>
              )}
            </div>
          </div>
          <div className="space-y-4 md:col-span-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{item.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow
                label="Found"
                value={item.foundAt ? new Date(item.foundAt).toLocaleString() : 'None (not reported by cleaner)'}
              />
              <DetailRow
                label="Stored"
                value={item.storedAt ? new Date(item.storedAt).toLocaleString() : 'Not in storage'}
              />
              <DetailRow label="Room" value={item.room ? `Room ${item.room.roomNumber}` : '—'} />
              <DetailRow
                label="Reported by"
                value={item.reportedBy?.name ?? item.reportedBy?.email ?? '—'}
              />
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Storage box</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <BoxPicker
                  value={item.storedLocation ?? ''}
                  onChange={(box) => onPatch({ status: 'STORED', storedLocation: box })}
                  disabled={pending}
                />
                {item.storedLocation && (
                  <span className="text-xs text-ink-muted">
                    Currently in <strong className="text-ink">{item.storedLocation}</strong>
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Status</p>
              <select
                disabled={pending}
                value={item.status}
                onChange={(e) => onPatch({ status: e.target.value })}
                className="mt-1.5 min-h-[40px] rounded-btn border border-border bg-surface px-3 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={!!item.guestContactedAt}
                disabled={pending}
                onChange={(e) => onPatch({ guestContacted: e.target.checked })}
              />
              Guest has been contacted
              {item.guestContactedAt && (
                <span className="text-xs text-ink-muted">
                  (on {new Date(item.guestContactedAt).toLocaleString()})
                </span>
              )}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
}

function AddItemModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState('');
  const [box, setBox] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      setError(null);
      const desc = description.trim();
      if (!desc) throw new Error('Description is required');

      let photoS3Key: string | null = null;
      if (file) {
        const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1600 });
        const mime = compressed.type?.trim() ? compressed.type : 'image/jpeg';
        const presign = await api<{ uploadUrl: string; key: string }>('/lost-found/presign', {
          method: 'POST',
          body: JSON.stringify({ contentType: mime }),
        });
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          body: compressed,
          headers: { 'Content-Type': mime },
        });
        if (!putRes.ok) throw new Error('Failed to upload photo');
        photoS3Key = presign.key;
      }

      await api('/lost-found', {
        method: 'POST',
        body: JSON.stringify({
          description: desc,
          photoS3Key,
          status: box ? 'STORED' : 'FOUND',
          storedLocation: box || null,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lost-found'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-card border border-border bg-surface shadow-lift sm:rounded-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Add lost & found item</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Use this to log existing storage items or something handed in directly at reception.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div>
            <label className="text-sm font-medium text-ink">Description *</label>
            <textarea
              className="mt-1.5 w-full rounded-btn border border-border bg-surface px-3 py-2.5 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Blue umbrella, handle slightly bent"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Storage box (optional)</label>
            <select
              className="mt-1.5 min-h-[40px] w-full rounded-btn border border-border bg-surface px-3 text-sm"
              value={box}
              onChange={(e) => setBox(e.target.value)}
            >
              <option value="">Leave in &quot;Not sorted&quot;</option>
              {LOST_FOUND_BOXES.map((b) => (
                <option key={b} value={b}>
                  Box {b}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              Selecting a box marks the item as stored immediately.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Photo (optional)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                {file ? 'Change photo' : 'Add photo'}
              </Button>
              {file && <span className="text-xs text-ink-muted">{file.name}</span>}
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" variant="action" disabled={submit.isPending}>
              {submit.isPending ? 'Saving…' : 'Save item'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
