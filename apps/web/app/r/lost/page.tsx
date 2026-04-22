'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';

type Lf = {
  id: string;
  description: string;
  status: string;
  foundAt: string;
  storedAt: string | null;
  guestContactedAt: string | null;
  storedLocation: string | null;
  photoS3Key: string | null;
  photoUrl?: string | null;
  room: { roomNumber: string } | null;
};

const STATUSES = ['FOUND', 'STORED', 'CLAIMED', 'CLOSED'];

export default function ReceptionLostFoundPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [editingLocation, setEditingLocation] = useState<Record<string, string>>({});

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['lost-found', status, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      const s = params.toString();
      return api<Lf[]>(`/lost-found${s ? `?${s}` : ''}`);
    },
  });

  const sorted = useMemo(() => {
    return [...raw].sort((a, b) => new Date(b.foundAt).getTime() - new Date(a.foundAt).getTime());
  }, [raw]);

  const patchItem = useMutation({
    mutationFn: (payload: { id: string; body: Record<string, unknown> }) =>
      api(`/lost-found/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lost-found'] }),
  });

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Lost & found</h1>
          <p className="mt-1 text-sm text-ink-muted">Search and filter logged items.</p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === 'grid' ? 'bg-ink text-white' : 'text-ink-muted'}`}
            onClick={() => setView('grid')}
          >
            Grid
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === 'table' ? 'bg-ink text-white' : 'text-ink-muted'}`}
            onClick={() => setView('table')}
          >
            Table
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Search</label>
          <input
            type="search"
            placeholder="Description…"
            className="mt-1 min-h-[40px] w-full min-w-[200px] rounded-btn border border-border bg-surface px-3 text-sm md:w-64"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Status</label>
          <select
            className="mt-1 min-h-[40px] min-w-[160px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      {view === 'grid' && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((item) => (
            <li key={item.id}>
              <Card className="h-full overflow-hidden p-0">
                <div className="flex aspect-[4/3] items-center justify-center bg-surface-muted text-ink-muted">
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.description} className="h-full w-full object-cover" />
                  ) : item.photoS3Key ? (
                    <span className="text-xs">Photo uploaded</span>
                  ) : (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-medium leading-snug text-ink">{item.description}</p>
                  <p className="mt-2 text-sm text-ink-muted">
                    {item.room ? `Room ${item.room.roomNumber}` : 'No room'} ·{' '}
                    {new Date(item.foundAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Stored since: {item.storedAt ? new Date(item.storedAt).toLocaleString() : 'Not in storage'}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Guest contacted: {item.guestContactedAt ? new Date(item.guestContactedAt).toLocaleString() : 'No'}
                  </p>
                  <span className="mt-3 inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium capitalize text-ink-muted">
                    {item.status.toLowerCase()}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {view === 'table' && (
        <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted/80 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Preview</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">Room</th>
                <th className="px-4 py-3 font-semibold">Date found</th>
                <th className="px-4 py-3 font-semibold">Stored since</th>
                <th className="px-4 py-3 font-semibold">Guest contacted</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Storage location</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.id} className="border-b border-border/80">
                  <td className="px-4 py-2">
                    <div className="flex h-12 w-16 items-center justify-center rounded-md bg-surface-muted text-[10px] text-ink-muted">
                      {item.photoS3Key ? 'Photo' : '—'}
                    </div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-ink">{item.description}</td>
                  <td className="px-4 py-3 text-ink-muted">{item.room ? item.room.roomNumber : '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{new Date(item.foundAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {item.storedAt ? new Date(item.storedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2 text-xs text-ink-muted">
                      <input
                        type="checkbox"
                        checked={!!item.guestContactedAt}
                        onChange={(e) =>
                          patchItem.mutate({ id: item.id, body: { guestContacted: e.target.checked } })
                        }
                      />
                      {item.guestContactedAt ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="min-h-[34px] rounded-btn border border-border bg-surface px-2 text-xs"
                      value={item.status}
                      onChange={(e) => patchItem.mutate({ id: item.id, body: { status: e.target.value } })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="min-h-[34px] rounded-btn border border-border bg-surface px-2 text-xs"
                        value={editingLocation[item.id] ?? item.storedLocation ?? ''}
                        onChange={(e) =>
                          setEditingLocation((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="Shelf / box"
                      />
                      <button
                        type="button"
                        className="rounded-btn border border-border px-2 py-1 text-xs"
                        onClick={() =>
                          patchItem.mutate({
                            id: item.id,
                            body: { storedLocation: editingLocation[item.id] ?? item.storedLocation ?? '' },
                          })
                        }
                      >
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length === 0 && !isLoading && <p className="text-sm text-ink-muted">No items match.</p>}
    </div>
  );
}
