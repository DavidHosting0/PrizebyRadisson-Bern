'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
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

export default function SupervisorMobileRequestsPage() {
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
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Requests</h1>
        <p className="mt-1 text-sm text-sidebar-muted">Service requests · claim or update status</p>
      </div>

      {isLoading && <p className="text-sm text-sidebar-muted">Loading…</p>}

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        {data.map((r) => (
          <li key={r.id}>
            <Card tone="dark" className="p-4">
              <p className="text-base font-semibold text-white">
                Room {r.room.roomNumber}
                <span className="font-normal text-sidebar-muted"> · {r.type.label}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase text-sidebar-muted">{r.status.replace(/_/g, ' ')}</span>
                <PriorityBadge priority={r.priority} tone="dark" />
              </div>
              {r.claimedBy && (
                <p className="mt-2 text-xs text-sidebar-muted">
                  {formatUserWithTitlePrefix(r.claimedBy.name, r.claimedBy.titlePrefix)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {(r.status === 'OPEN' || r.status === 'CREATED') && (
                  <Button variant="action" className="min-h-[44px] px-4 text-sm" onClick={() => claim.mutate(r.id)}>
                    Claim
                  </Button>
                )}
                <select
                  className="min-h-[44px] flex-1 rounded-btn border border-sidebar-border/70 bg-[#121a26] px-2 text-sm text-slate-100"
                  value={r.status === 'CREATED' ? 'OPEN' : r.status}
                  onChange={(e) => patch.mutate({ id: r.id, status: e.target.value })}
                  disabled={patch.isPending}
                >
                  {['OPEN', 'CLAIMED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'].map((s) => (
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
      {data.length === 0 && !isLoading && <p className="text-sm text-sidebar-muted">No requests.</p>}
    </div>
  );
}
