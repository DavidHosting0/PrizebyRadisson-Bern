'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserRef } from '@/lib/userTitlePrefix';
import { Button } from '@/components/ui/Button';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

type Req = {
  id: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
};

const STATUSES = ['OPEN', 'CLAIMED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] as const;

export default function SupervisorRequestsPage() {
  const qc = useQueryClient();
  const { enterMobile } = useSupervisorMobileMode();
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
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Service requests"
        description="Oversight and escalation"
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />

      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
          {isLoading && <p className="text-sm text-sidebar-muted">Loading…</p>}

          <ul className="space-y-3">
            {data.map((r) => (
              <li key={r.id}>
                <div className={APP_DARK_CARD + ' flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between'}>
                  <div>
                    <p className="text-lg font-semibold text-white">
                      Room {r.room.roomNumber}
                      <span className="font-normal text-sidebar-muted"> · {r.type.label}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase text-sidebar-muted">{r.status.replace(/_/g, ' ')}</span>
                      <span
                        className={
                          r.priority === 'URGENT'
                            ? 'inline-flex rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-300'
                            : 'inline-flex rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-sidebar-muted'
                        }
                      >
                        {r.priority === 'URGENT' ? 'Urgent' : 'Normal'}
                      </span>
                      {r.claimedBy && (
                        <span className="text-xs text-sidebar-muted">· {formatUserRef(r.claimedBy)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.priority === 'URGENT' && r.status !== 'RESOLVED' && (
                      <span className="self-center rounded-full bg-red-500/15 px-2 py-1 text-xs font-medium text-red-300">
                        Urgent
                      </span>
                    )}
                    {(r.status === 'OPEN' || r.status === 'CREATED') && (
                      <Button
                        variant="secondary"
                        className="min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
                        onClick={() => claim.mutate(r.id)}
                      >
                        Claim
                      </Button>
                    )}
                    <select
                      className={APP_DARK_INPUT + ' min-h-[44px]'}
                      value={r.status === 'CREATED' ? 'OPEN' : r.status}
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
                </div>
              </li>
            ))}
          </ul>
          {data.length === 0 && !isLoading && <p className="text-sm text-sidebar-muted">No requests.</p>}
        </div>
      </AppPageBody>
    </div>
  );
}
