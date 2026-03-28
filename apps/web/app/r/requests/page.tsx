'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Button } from '@/components/ui/Button';
import { useReceptionUi } from '@/app/r/reception-context';

type Req = {
  id: string;
  roomId: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string } | null;
};

export default function ReceptionRequestsPage() {
  const qc = useQueryClient();
  const { openNewRequest } = useReceptionUi();

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

  const active = list.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CANCELLED');

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Service requests</h1>
          <p className="mt-1 text-sm text-ink-muted">Create, track, and manage guest requests.</p>
        </div>
        <Button type="button" variant="action" className="min-h-[48px]" onClick={openNewRequest}>
          + New request
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted/80 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Room</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Priority</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Assigned</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {active.map((r) => (
              <tr key={r.id} className="border-b border-border/80 hover:bg-surface-muted/40">
                <td className="px-4 py-3 font-semibold text-ink">Room {r.room.roomNumber}</td>
                <td className="px-4 py-3 text-ink-muted">{r.type.label}</td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={r.priority} />
                </td>
                <td className="px-4 py-3 capitalize text-ink-muted">{r.status.replace(/_/g, ' ').toLowerCase()}</td>
                <td className="px-4 py-3 text-ink-muted">{r.claimedBy?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {r.priority === 'NORMAL' && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[36px] px-3 py-1.5 text-xs"
                        disabled={escalate.isPending}
                        onClick={() => escalate.mutate(r.id)}
                      >
                        Escalate
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-[36px] px-3 py-1.5 text-xs text-danger"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(r.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active.length === 0 && !isLoading && (
        <p className="text-sm text-ink-muted">No active requests.</p>
      )}
    </div>
  );
}
