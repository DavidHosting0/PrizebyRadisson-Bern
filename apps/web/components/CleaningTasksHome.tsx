'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('housekeeper');
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

  function DepartureStatus({ task }: { task: MyDailyTaskDto }) {
    if (!task.isDepartureToday) return null;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-btn bg-red-500/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-100 ring-1 ring-inset ring-red-400/40">
          {t('departureToday')}
        </span>
        {task.guestCheckedOut ? (
          <span className="rounded-btn bg-emerald-400/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-950">
            {t('guestCheckedOut')}
          </span>
        ) : (
          <span className="rounded-btn bg-amber-300/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
            {t('guestStillInRoom')}
          </span>
        )}
      </div>
    );
  }

  if (dailyLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-sidebar-muted">{t('loadingRooms')}</p>
      </div>
    );
  }
  if (dailyError) {
    return (
      <div className="p-4">
        <p className="text-sm text-danger">{t('loadRoomsError')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">{t('myRooms')}</h2>
        <ul className="mt-3 space-y-3">
          {dirtyTasks.map((task) => (
            <li key={task.id}>
              <Link href={paths.room(task.roomId!)} className="block tap-scale">
                <Card tone="dark" className={cardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold tracking-tight text-white">
                        {t('room', { number: task.roomNumber ?? '—' })}
                      </p>
                      {task.floor != null && (
                        <p className="mt-0.5 text-xs text-sidebar-muted">
                          {t('floor', { floor: task.floor })}
                        </p>
                      )}
                      {task.overdueDays != null && task.overdueDays > 0 && (
                        <p className="mt-1 text-xs font-semibold text-red-300">
                          {t('overdueDays', { days: task.overdueDays })}
                        </p>
                      )}
                      {task.guestName && (
                        <p className="mt-1 truncate text-xs text-sidebar-muted">{task.guestName}</p>
                      )}
                      <DepartureStatus task={task} />
                    </div>
                    <StatusBadge status="DIRTY" variant="dark" />
                  </div>
                  <p className="mt-3 text-sm text-sidebar-muted">{t('tapToFinish')}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {dirtyTasks.length === 0 && (
          <p className="mt-2 text-sm text-sidebar-muted">{t('noDirtyRooms')}</p>
        )}
      </section>

      {restantTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
            {t('restants')}
          </h2>
          <ul className="mt-3 space-y-3">
            {restantTasks.map((task) => (
              <li key={task.id}>
                <Card tone="dark" className={clsx(cardClass, 'flex flex-wrap items-center justify-between gap-3')}>
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {t('room', { number: task.roomNumber ?? '—' })}
                    </p>
                    {task.floor != null && (
                      <p className="text-xs text-sidebar-muted">{t('floor', { floor: task.floor })}</p>
                    )}
                    <p className="mt-1 text-xs text-sidebar-muted">{t('stayoverRestant')}</p>
                    <DepartureStatus task={task} />
                  </div>
                  <Button
                    variant="action"
                    className="min-h-[44px] px-4 py-2 text-sm"
                    disabled={completeTask.isPending}
                    onClick={() => completeTask.mutate(task.id)}
                  >
                    {t('fertig')}
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
            {t('publicAreas')}
          </h2>
          <ul className="mt-3 space-y-3">
            {publicTasks.map((task) => (
              <li key={task.id}>
                <Card tone="dark" className={clsx(cardClass, 'flex flex-wrap items-center justify-between gap-3')}>
                  <div>
                    <p className="font-semibold text-white">{task.publicAreaName}</p>
                    {task.floor != null && (
                      <p className="text-xs text-sidebar-muted">{t('floor', { floor: task.floor })}</p>
                    )}
                  </div>
                  <Button
                    variant="action"
                    className="min-h-[44px] px-4 py-2 text-sm"
                    disabled={completeTask.isPending}
                    onClick={() => completeTask.mutate(task.id)}
                  >
                    {t('markDone')}
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
            {t('inspections')}
          </h2>
          <p className="mt-1 text-xs text-sidebar-muted">{t('inspectionsHint')}</p>
          {inspectionTasks.length === 0 ? (
            <p className="mt-3 text-sm text-sidebar-muted">{t('noInspections')}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {inspectionTasks.map((task) => {
                const isMine = task.claimedByUserId === user?.id;
                const claimed = task.status === 'CLAIMED';
                return (
                  <li key={task.id}>
                    <Card tone="dark" className={cardClass}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tabular-nums text-white">
                            {t('room', { number: task.roomNumber ?? '—' })}
                          </p>
                          {task.floor != null && (
                            <p className="mt-0.5 text-xs text-sidebar-muted">
                              {t('floor', { floor: task.floor })}
                            </p>
                          )}
                          {claimed && task.claimedByName && (
                            <p className="mt-1 text-xs text-sidebar-muted">
                              {t('claimedBy', { name: task.claimedByName })}
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
                            onClick={() => claimInspection.mutate(task.id)}
                          >
                            {t('claim')}
                          </Button>
                        )}
                        {isMine && (
                          <>
                            <Link
                              href={paths.inspect(task.roomId)}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-action px-4 text-sm font-medium text-white"
                            >
                              {t('inspect')}
                            </Link>
                            <Button
                              type="button"
                              variant="ghostOnDark"
                              className="min-h-[44px]"
                              disabled={releaseInspection.isPending}
                              onClick={() => releaseInspection.mutate(task.id)}
                            >
                              {t('release')}
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
          {t('openRequests')}
        </h2>
        {reqLoading ? (
          <p className="mt-3 text-sm text-sidebar-muted">{t('loadingRequests')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {open.map((r) => (
              <li key={r.id}>
                <Card tone="dark" className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">
                        {t('room', { number: r.room.roomNumber })}
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
                      {t('claim')}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {!reqLoading && open.length === 0 && (
          <p className="mt-2 text-sm text-sidebar-muted">{t('noOpenRequests')}</p>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
            {t('myActiveTasks')}
          </h2>
          <ul className="mt-3 space-y-3">
            {mine.map((r) => (
              <li key={r.id}>
                <Card tone="dark" className={cardClass}>
                  <p className="font-semibold text-white">
                    {t('room', { number: r.room.roomNumber })}
                    <span className="font-normal text-sidebar-muted"> · {r.type.label}</span>
                  </p>
                  <p className="mt-1 text-xs text-sidebar-muted">{t('inProgressHint')}</p>
                  <Link
                    href={paths.requests}
                    className="mt-3 inline-block text-sm font-medium text-action underline underline-offset-2"
                  >
                    {t('goToRequests')}
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
