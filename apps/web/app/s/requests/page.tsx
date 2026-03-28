'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type Req = {
  id: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string } | null;
};

const STATUSES = ['CREATED', 'OPEN', 'CLAIMED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] as const;

export default function SupervisorRequestsPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<Req[]>('/service-requests'),
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/service-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  const claim = useMutation({
    mutationFn: (id: string) => api(`/service-requests/${id}/claim`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Service requests</h1>
        <p className="mt-1 text-sm text-ink-muted">Oversight and escalation</p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      <ul className="space-y-3">
        {data.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-lg font-semibold text-ink">
                  Room {r.room.roomNumber}
                  <span className="font-normal text-ink-muted"> · {r.type.label}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase text-ink-muted">{r.status.replace(/_/g, ' ')}</span>
                  <PriorityBadge priority={r.priority} />
                  {r.claimedBy && (
                    <span className="text-xs text-ink-muted">· {r.claimedBy.name}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.priority === 'URGENT' && r.status !== 'RESOLVED' && (
                  <span className="self-center rounded-full bg-danger-muted px-2 py-1 text-xs font-medium text-danger">
                    Urgent
                  </span>
                )}
                {(r.status === 'OPEN' || r.status === 'CREATED') && (
                  <Button variant="secondary" className="min-h-[44px]" onClick={() => claim.mutate(r.id)}>
                    Claim
                  </Button>
                )}
                <select
                  className="min-h-[44px] rounded-btn border border-border bg-surface px-3 text-sm"
                  value={r.status}
                  onChange={(e) => patch.mutate({ id: r.id, status: e.target.value })}
                  disabled={patch.isPending}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {data.length === 0 && !isLoading && <p className="text-sm text-ink-muted">No requests.</p>}
    </div>
  );
}
