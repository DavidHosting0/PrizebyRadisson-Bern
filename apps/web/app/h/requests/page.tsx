'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type Req = {
  id: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
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

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-ink-muted">Loading requests…</p>
      </div>
    );
  }

  const rows = data ?? [];
  const open = rows.filter((r) => r.status === 'OPEN');
  const mine = rows.filter(
    (r) =>
      r.claimedBy?.id === user?.id &&
      (r.status === 'CLAIMED' || r.status === 'IN_PROGRESS'),
  );

  return (
    <div className="space-y-8 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Requests</h1>
        <p className="mt-1 text-sm text-ink-muted">Claim open work or complete what you started.</p>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Open</h2>
        <ul className="mt-3 space-y-3">
          {open.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-ink">Room {r.room.roomNumber}</p>
                    <p className="mt-1 text-sm text-ink-muted">{r.type.label}</p>
                    <div className="mt-2">
                      <PriorityBadge priority={r.priority} />
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    className="min-h-[48px] min-w-[96px]"
                    disabled={claim.isPending}
                    onClick={() => claim.mutate(r.id)}
                  >
                    Claim
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {open.length === 0 && <p className="mt-2 text-sm text-ink-muted">No open requests.</p>}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">My active tasks</h2>
        <ul className="mt-3 space-y-3">
          {mine.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-ink">Room {r.room.roomNumber}</p>
                    <p className="mt-1 text-sm text-ink-muted">{r.type.label}</p>
                  </div>
                  <Button variant="secondary" disabled={resolve.isPending} onClick={() => resolve.mutate(r.id)}>
                    Mark as done
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {mine.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">You have no claimed requests in progress.</p>
        )}
      </section>
    </div>
  );
}
