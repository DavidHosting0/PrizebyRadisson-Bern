'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
  photoUrl?: string | null;
  room: { roomNumber: string } | null;
};

const STATUSES = ['FOUND', 'STORED', 'CLAIMED', 'CLOSED'];

export default function SupervisorLostFoundPage() {
  const [status, setStatus] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['lost-found', status],
    queryFn: () => {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      return api<Lf[]>(`/lost-found${q}`);
    },
  });

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Lost & found</h1>
          <p className="mt-1 text-sm text-ink-muted">Inventory and status</p>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Filter by status</label>
          <select
            className="mt-1 min-h-[44px] min-w-[160px] rounded-btn border border-border bg-surface px-3 text-sm"
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

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((item) => (
          <li key={item.id}>
            <Card className="h-full">
              {item.photoUrl && (
                <img src={item.photoUrl} alt={item.description} className="mb-3 h-40 w-full rounded-card object-cover" />
              )}
              <p className="font-medium leading-snug text-ink">{item.description}</p>
              <p className="mt-3 text-sm text-ink-muted">
                {item.room ? `Room ${item.room.roomNumber}` : 'No room'} ·{' '}
                {new Date(item.foundAt).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Stored since: {item.storedAt ? new Date(item.storedAt).toLocaleString() : 'Not in storage'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Guest contacted: {item.guestContactedAt ? 'Yes' : 'No'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Location: {item.storedLocation || '—'}
              </p>
              <span className="mt-3 inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium capitalize text-ink-muted">
                {item.status.toLowerCase()}
              </span>
            </Card>
          </li>
        ))}
      </ul>
      {data.length === 0 && !isLoading && <p className="text-sm text-ink-muted">No items.</p>}
    </div>
  );
}
