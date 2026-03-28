'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Req = {
  id: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string } | null;
};

export default function HousekeeperRequestsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<Req[]>('/service-requests'),
  });

  const claim = useMutation({
    mutationFn: (id: string) => api<Req>(`/service-requests/${id}/claim`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  const resolve = useMutation({
    mutationFn: (id: string) =>
      api<Req>(`/service-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  if (isLoading) return <p className="p-4">Loading…</p>;

  const rows = data ?? [];
  const open = rows.filter((r) => r.status === 'OPEN');
  const mine = rows.filter(
    (r) =>
      r.claimedBy?.id === user?.id &&
      (r.status === 'CLAIMED' || r.status === 'IN_PROGRESS'),
  );

  return (
    <div className="space-y-6 p-4">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Open</h2>
        <ul className="mt-2 space-y-2">
          {open.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-medium">
                    Room {r.room.roomNumber} · {r.type.label}
                  </p>
                  <p className="text-xs text-slate-500">{r.priority}</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-accent px-3 py-1 text-sm text-white"
                  onClick={() => claim.mutate(r.id)}
                >
                  Claim
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Claimed</h2>
        <ul className="mt-2 space-y-2">
          {mine.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-medium">
                    Room {r.room.roomNumber} · {r.type.label}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1 text-sm"
                  onClick={() => resolve.mutate(r.id)}
                >
                  Resolve
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
