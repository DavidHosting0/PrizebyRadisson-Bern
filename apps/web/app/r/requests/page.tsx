'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserRef } from '@/lib/userTitlePrefix';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Button } from '@/components/ui/Button';
import { useReceptionUi } from '@/app/r/reception-context';
import { usePermission } from '@/lib/auth-context';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

type Req = {
  id: string;
  roomId: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
};

export default function ReceptionRequestsPage() {
  const qc = useQueryClient();
  const { openNewRequest } = useReceptionUi();
  const canCreateRequest = usePermission('SERVICE_REQUEST_CREATE');
  const { enterMobile } = useReceptionMobileMode();

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
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Service requests"
        description="Create, track, and manage guest requests"
        actions={
          <>
            <AppChromeTools onEnterMobile={enterMobile} />
            {canCreateRequest && (
              <Button type="button" variant="action" className="min-h-[40px]" onClick={openNewRequest}>
                + New request
              </Button>
            )}
          </>
        }
      />

      <AppPageBody>
        <div className="space-y-6 p-4 md:p-6">
          {isLoading && <p className="text-sm text-sidebar-muted">Loading…</p>}

          <div className={APP_DARK_CARD + ' overflow-x-auto'}>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-sidebar-border/60 bg-white/5 text-xs uppercase tracking-wide text-sidebar-muted">
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
                  <tr key={r.id} className="border-b border-sidebar-border/40 hover:bg-white/5">
                    <td className="px-4 py-3 font-semibold text-white">Room {r.room.roomNumber}</td>
                    <td className="px-4 py-3 text-sidebar-muted">{r.type.label}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td className="px-4 py-3 capitalize text-sidebar-muted">
                      {r.status.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-sidebar-muted">
                      {r.claimedBy ? formatUserRef(r.claimedBy) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {r.priority === 'NORMAL' && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-[36px] border border-sidebar-border bg-transparent px-3 py-1.5 text-xs text-white hover:bg-white/10"
                            disabled={escalate.isPending}
                            onClick={() => escalate.mutate(r.id)}
                          >
                            Escalate
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-[36px] px-3 py-1.5 text-xs text-red-300 hover:bg-white/10"
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
            <p className="text-sm text-sidebar-muted">No active requests.</p>
          )}
        </div>
      </AppPageBody>
    </div>
  );
}
