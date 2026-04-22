'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useReceptionUi } from '@/app/r/reception-context';
import { usePermission } from '@/lib/auth-context';

type Req = {
  id: string;
  roomId: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
};

export default function ReceptionMobileRequestsPage() {
  const qc = useQueryClient();
  const { openNewRequest } = useReceptionUi();
  const canCreateRequest = usePermission('SERVICE_REQUEST_CREATE');

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<Req[]>('/service-requests'),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api(`/service-requests/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  const escalate = useMutation({
    mutationFn: (id: string) =>
      api(`/service-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: 'URGENT' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/service-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  const active = list.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CANCELLED');

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Requests</h1>
          <p className="mt-1 text-sm text-ink-muted">Guest and housekeeping requests</p>
        </div>
        {canCreateRequest && (
          <Button type="button" variant="action" className="min-h-[40px] px-3 text-sm" onClick={openNewRequest}>
            + New
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        {active.map((r) => (
          <li key={r.id}>
            <Card className="p-4">
              <p className="text-base font-semibold text-ink">
                Room {r.room.roomNumber}
                <span className="font-normal text-ink-muted"> · {r.type.label}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase text-ink-muted">{r.status.replace(/_/g, ' ')}</span>
                <PriorityBadge priority={r.priority} />
              </div>
              {r.claimedBy && (
                <p className="mt-2 text-xs text-ink-muted">
                  Assigned to {formatUserWithTitlePrefix(r.claimedBy.name, r.claimedBy.titlePrefix)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  className="min-h-[40px] flex-1 rounded-btn border border-border bg-surface px-2 text-sm"
                  value={r.status}
                  onChange={(e) => patch.mutate({ id: r.id, status: e.target.value })}
                  disabled={patch.isPending}
                >
                  {['CREATED', 'OPEN', 'CLAIMED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'].map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                {r.priority === 'NORMAL' && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-[40px] px-3 py-1.5 text-xs"
                    disabled={escalate.isPending}
                    onClick={() => escalate.mutate(r.id)}
                  >
                    Escalate
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-[40px] px-3 py-1.5 text-xs text-danger"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(r.id)}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {active.length === 0 && !isLoading && <p className="text-sm text-ink-muted">No active requests.</p>}
    </div>
  );
}
