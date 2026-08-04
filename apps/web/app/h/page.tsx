'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InspectionQueueResponse, MyDailyTaskDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/StatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type RoomRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
};

type Req = {
  id: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
};

export default function HousekeeperRoomsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: (id: string) => api(`/service-requests/${id}/claim`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });
  const { data: rooms, isLoading: roomsLoading, error: roomsError } = useQuery({
    queryKey: ['rooms', 'mine'],
    queryFn: () => api<RoomRow[]>('/rooms?mine=1'),
  });
  const { data: daily } = useQuery({
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

  const completePublic = useMutation({
    mutationFn: (taskId: string) =>
      api(`/assignments/daily-plan/tasks/${taskId}/complete`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments', 'my-daily-tasks'] });
    },
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
  const open = rows.filter((r) => r.status === 'OPEN');
  const mine = rows.filter(
    (r) =>
      r.claimedBy?.id === user?.id &&
      (r.status === 'CLAIMED' || r.status === 'IN_PROGRESS'),
  );

  const overdueByRoom = new Map(
    (daily?.tasks ?? [])
      .filter((t) => t.roomId && t.overdueDays && t.overdueDays > 0)
      .map((t) => [t.roomId!, t.overdueDays!]),
  );
  const publicTasks = (daily?.tasks ?? []).filter(
    (t) => t.kind === 'PUBLIC_AREA' && !t.completedAt,
  );
  const inspectionTasks = inspectionQueue?.onDuty ? inspectionQueue.tasks : [];

  if (roomsLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-ink-muted">Loading your rooms…</p>
      </div>
    );
  }
  if (roomsError) {
    return (
      <div className="p-4">
        <p className="text-sm text-danger">Could not load rooms.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">My rooms</h2>
        <ul className="mt-3 space-y-3">
          {rooms?.map((r) => (
            <li key={r.id}>
              <Link href={`/h/room/${r.id}`} className="block tap-scale">
                <Card className="transition-shadow hover:shadow-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold tracking-tight text-ink">Room {r.roomNumber}</p>
                      {r.floor != null && (
                        <p className="mt-0.5 text-xs text-ink-muted">Floor {r.floor}</p>
                      )}
                      {overdueByRoom.has(r.id) && (
                        <p className="mt-1 text-xs font-semibold text-red-600">
                          Overdue {overdueByRoom.get(r.id)} day
                          {overdueByRoom.get(r.id) === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={r.derivedStatus} />
                  </div>
                  <p className="mt-3 text-sm text-ink-muted">Tap to finish cleaning</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {rooms?.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">No rooms assigned right now.</p>
        )}
      </section>

      {publicTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Public areas
          </h2>
          <ul className="mt-3 space-y-3">
            {publicTasks.map((t) => (
              <li key={t.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{t.publicAreaName}</p>
                    {t.floor != null && (
                      <p className="text-xs text-ink-muted">Floor {t.floor}</p>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    className="min-h-[44px] px-4 py-2 text-sm"
                    disabled={completePublic.isPending}
                    onClick={() => completePublic.mutate(t.id)}
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Inspections
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Claim a cleaned room, then inspect. Shared with today’s other inspectors.
          </p>
          {inspectionTasks.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No rooms waiting for inspection.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {inspectionTasks.map((t) => {
                const mine = t.claimedByUserId === user?.id;
                const claimed = t.status === 'CLAIMED';
                return (
                  <li key={t.id}>
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tabular-nums text-ink">
                            Room {t.roomNumber}
                          </p>
                          {t.floor != null && (
                            <p className="mt-0.5 text-xs text-ink-muted">Floor {t.floor}</p>
                          )}
                          {claimed && t.claimedByName && (
                            <p className="mt-1 text-xs text-ink-muted">
                              Claimed by {t.claimedByName}
                            </p>
                          )}
                        </div>
                        <StatusBadge status="CLEAN" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!claimed && (
                          <Button
                            type="button"
                            variant="primary"
                            className="min-h-[44px]"
                            disabled={claimInspection.isPending}
                            onClick={() => claimInspection.mutate(t.id)}
                          >
                            Claim
                          </Button>
                        )}
                        {mine && (
                          <>
                            <Link
                              href={`/h/inspect/${t.roomId}`}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-action px-4 text-sm font-medium text-white"
                            >
                              Inspect
                            </Link>
                            <Button
                              type="button"
                              variant="ghost"
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Open requests</h2>
        {reqLoading ? (
          <p className="mt-3 text-sm text-ink-muted">Loading requests…</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {open.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">
                        Room {r.room.roomNumber}
                        <span className="font-normal text-ink-muted"> · {r.type.label}</span>
                      </p>
                      <div className="mt-2">
                        <PriorityBadge priority={r.priority} />
                      </div>
                    </div>
                    <Button
                      variant="primary"
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
          <p className="mt-2 text-sm text-ink-muted">No open requests.</p>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">My active tasks</h2>
          <ul className="mt-3 space-y-3">
            {mine.map((r) => (
              <li key={r.id}>
                <Card>
                  <p className="font-semibold text-ink">
                    Room {r.room.roomNumber}
                    <span className="font-normal text-ink-muted"> · {r.type.label}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">In progress — finish on Requests tab</p>
                  <Link href="/h/requests" className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-2">
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
