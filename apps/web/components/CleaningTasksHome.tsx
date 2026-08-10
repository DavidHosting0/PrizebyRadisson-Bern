'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InspectionQueueResponse, MyDailyTaskDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/StatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/toast/ToastProvider';

type Req = {
  id: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
};

export type CleaningTasksHomePaths = {
  room: (roomId: string) => string;
  inspect: (roomId: string) => string;
  requests: string;
};

function parseApiError(raw: string): string {
  try {
    const j = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join(', ');
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* plain text */
  }
  return raw || 'Request failed';
}

/** Shared housekeeper / supervisor-mobile home: rooms, restants, public areas, inspections, requests. */
export function CleaningTasksHome({ paths }: { paths: CleaningTasksHomePaths }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const claim = useMutation({
    mutationFn: (id: string) => api(`/service-requests/${id}/claim`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const { data: daily, isLoading: dailyLoading, error: dailyError } = useQuery({
    queryKey: ['assignments', 'my-daily-tasks'],
    queryFn: () => api<{ date: string; tasks: MyDailyTaskDto[] }>('/assignments/my-daily-tasks'),
  });
  const { data: inspectionQueue } = useQuery({
    queryKey: ['assignments', 'my-inspection-tasks'],
    queryFn: () => api<InspectionQueueResponse>('/assignments/my-inspection-tasks'),
  });
  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<Req[]>('/service-requests'),
  });

  const completeTask = useMutation({
    mutationFn: (taskId: string) =>
      api(`/assignments/daily-plan/tasks/${taskId}/complete`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments', 'my-daily-tasks'] });
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const claimInspection = useMutation({
    mutationFn: (id: string) =>
      api<InspectionQueueResponse>(`/assignments/inspection-tasks/${id}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(['assignments', 'my-inspection-tasks'], data);
    },
  });

  const releaseInspection = useMutation({
    mutationFn: (id: string) =>
      api<InspectionQueueResponse>(`/assignments/inspection-tasks/${id}/release`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      qc.setQueryData(['assignments', 'my-inspection-tasks'], data);
    },
  });

  const rows = requests ?? [];
  const open = rows.filter((r) => r.status === 'OPEN' || r.status === 'CREATED');
  const mine = rows.filter(
    (r) =>
      r.claimedBy?.id === user?.id &&
      (r.status === 'CLAIMED' || r.status === 'IN_PROGRESS'),
  );

  const openRoomTasks = (daily?.tasks ?? []).filter(
    (t) => t.kind === 'ROOM' && t.roomId && !t.completedAt && (t.workType === 'DIRTY' || t.workType === 'RESTANT'),
  );
  const dirtyTasks = openRoomTasks.filter((t) => t.workType === 'DIRTY');
  const restantTasks = openRoomTasks.filter((t) => t.workType === 'RESTANT');
  const publicTasks = (daily?.tasks ?? []).filter(
    (t) => t.kind === 'PUBLIC_AREA' && !t.completedAt,
  );
  const inspectionTasks = inspectionQueue?.onDuty ? inspectionQueue.tasks : [];

  const cardClass = 'transition-shadow hover:border-action/30 hover:shadow-lift';

  if (dailyLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-sidebar-muted">Loading your rooms…</p>
      </div>
    );
  }
  if (dailyError) {
    return (
      <div className="p-4">
        <p className="text-sm text-danger">Could not load rooms.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">My rooms</h2>
        <ul className="mt-3 space-y-3">
          {dirtyTasks.map((t) => (
            <li key={t.id}>
              <Link href={paths.room(t.roomId!)} className="block tap-scale">
                <Card tone="dark" className={cardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold tracking-tight text-white">
                        Room {t.roomNumber}
                      </p>
                      {t.floor != null && (
                        <p className="mt-0.5 text-xs text-sidebar-muted">Floor {t.floor}</p>
                      )}
                      {t.overdueDays != null && t.overdueDays > 0 && (
                        <p className="mt-1 text-xs font-semibold text-red-300">
                          Overdue {t.overdueDays} day{t.overdueDays === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                    <StatusBadge status="DIRTY" variant="dark" />
                  </div>
                  <p className="mt-3 text-sm text-sidebar-muted">Tap to finish cleaning</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {dirtyTasks.length === 0 && (
          <p className="mt-2 text-sm text-sidebar-muted">No dirty rooms assigned right now.</p>
        )}
      </section>

      {restantTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
            Restants
          </h2>
          <ul className="mt-3 space-y-3">
            {restantTasks.map((t) => (
              <li key={t.id}>
                <Card tone="dark" className={clsx(cardClass, 'flex flex-wrap items-center justify-between gap-3')}>
                  <div>
                    <p className="text-lg font-semibold text-white">Room {t.roomNumber}</p>
                    {t.floor != null && (
                      <p className="text-xs text-sidebar-muted">Floor {t.floor}</p>
                    )}
                    <p className="mt-1 text-xs text-sidebar-muted">Stayover / restant</p>
                  </div>
                  <Button
                    variant="action"
                    className="min-h-[44px] px-4 py-2 text-sm"
                    disabled={completeTask.isPending}
                    onClick={() => completeTask.mutate(t.id)}
                  >
                    Fertig
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {publicTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
            Public areas
          </h2>
          <ul className="mt-3 space-y-3">
            {publicTasks.map((t) => (
              <li key={t.id}>
                <Card tone="dark" className={clsx(cardClass, 'flex flex-wrap items-center justify-between gap-3')}>
                  <div>
                    <p className="font-semibold text-white">{t.publicAreaName}</p>
                    {t.floor != null && (
                      <p className="text-xs text-sidebar-muted">Floor {t.floor}</p>
                    )}
                  </div>
                  <Button
                    variant="action"
                    className="min-h-[44px] px-4 py-2 text-sm"
                    disabled={completeTask.isPending}
                    onClick={() => completeTask.mutate(t.id)}
                  >
                    Mark done
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inspectionQueue?.onDuty && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
            Inspections
          </h2>
          <p className="mt-1 text-xs text-sidebar-muted">
            Claim a cleaned room, then inspect. Shared with today’s other inspectors.
          </p>
          {inspectionTasks.length === 0 ? (
            <p className="mt-3 text-sm text-sidebar-muted">No rooms waiting for inspection.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {inspectionTasks.map((t) => {
                const isMine = t.claimedByUserId === user?.id;
                const claimed = t.status === 'CLAIMED';
                return (
                  <li key={t.id}>
                    <Card tone="dark" className={cardClass}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tabular-nums text-white">
                            Room {t.roomNumber}
                          </p>
                          {t.floor != null && (
                            <p className="mt-0.5 text-xs text-sidebar-muted">Floor {t.floor}</p>
                          )}
                          {claimed && t.claimedByName && (
                            <p className="mt-1 text-xs text-sidebar-muted">
                              Claimed by {t.claimedByName}
                            </p>
                          )}
                        </div>
                        <StatusBadge status="CLEAN" variant="dark" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!claimed && (
                          <Button
                            type="button"
                            variant="action"
                            className="min-h-[44px]"
                            disabled={claimInspection.isPending}
                            onClick={() => claimInspection.mutate(t.id)}
                          >
                            Claim
                          </Button>
                        )}
                        {isMine && (
                          <>
                            <Link
                              href={paths.inspect(t.roomId)}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-action px-4 text-sm font-medium text-white"
                            >
                              Inspect
                            </Link>
                            <Button
                              type="button"
                              variant="ghostOnDark"
                              className="min-h-[44px]"
                              disabled={releaseInspection.isPending}
                              onClick={() => releaseInspection.mutate(t.id)}
                            >
                              Release
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Open requests</h2>
        {reqLoading ? (
          <p className="mt-3 text-sm text-sidebar-muted">Loading requests…</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {open.map((r) => (
              <li key={r.id}>
                <Card tone="dark" className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">
                        Room {r.room.roomNumber}
                        <span className="font-normal text-sidebar-muted"> · {r.type.label}</span>
                      </p>
                      <div className="mt-2">
                        <PriorityBadge priority={r.priority} tone="dark" />
                      </div>
                    </div>
                    <Button
                      variant="action"
                      className="min-h-[44px] px-4 py-2 text-sm"
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
        )}
        {!reqLoading && open.length === 0 && (
          <p className="mt-2 text-sm text-sidebar-muted">No open requests.</p>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">My active tasks</h2>
          <ul className="mt-3 space-y-3">
            {mine.map((r) => (
              <li key={r.id}>
                <Card tone="dark" className={cardClass}>
                  <p className="font-semibold text-white">
                    Room {r.room.roomNumber}
                    <span className="font-normal text-sidebar-muted"> · {r.type.label}</span>
                  </p>
                  <p className="mt-1 text-xs text-sidebar-muted">In progress — finish on Requests tab</p>
                  <Link
                    href={paths.requests}
                    className="mt-3 inline-block text-sm font-medium text-action underline underline-offset-2"
                  >
                    Go to requests
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
