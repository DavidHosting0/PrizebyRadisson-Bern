'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InspectionQueueResponse } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type RoomRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
};

export default function SupervisorMobileInspectionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const queueQ = useQuery({
    queryKey: ['assignments', 'my-inspection-tasks'],
    queryFn: () => api<InspectionQueueResponse>('/assignments/my-inspection-tasks'),
  });

  const roomsQ = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api<RoomRow[]>('/rooms'),
    enabled: (queueQ.data?.duties.length ?? 0) === 0,
  });

  const claim = useMutation({
    mutationFn: (id: string) =>
      api<InspectionQueueResponse>(`/assignments/inspection-tasks/${id}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(['assignments', 'my-inspection-tasks'], data);
    },
  });

  const release = useMutation({
    mutationFn: (id: string) =>
      api<InspectionQueueResponse>(`/assignments/inspection-tasks/${id}/release`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      qc.setQueryData(['assignments', 'my-inspection-tasks'], data);
    },
  });

  const useQueue = (queueQ.data?.duties.length ?? 0) > 0;
  const tasks = queueQ.data?.tasks ?? [];

  const needInspection = (roomsQ.data ?? [])
    .filter((r) => r.derivedStatus === 'CLEAN')
    .sort((a, b) => {
      const fa = a.floor ?? 999;
      const fb = b.floor ?? 999;
      if (fa !== fb) return fa - fb;
      return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Inspections</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {useQueue
            ? 'Claim a cleaned room, then open inspect. Shared queue for today’s inspectors.'
            : 'Rooms that are fully cleaned and waiting for inspection (no inspectors set for today).'}
        </p>
      </div>

      {queueQ.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      {useQueue && (
        <>
          {!queueQ.isLoading && tasks.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center text-sm text-ink-muted">
              No rooms in the inspection queue right now.
            </p>
          )}
          <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
            {tasks.map((t) => {
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
                          disabled={claim.isPending}
                          onClick={() => claim.mutate(t.id)}
                        >
                          Claim
                        </Button>
                      )}
                      {mine && (
                        <>
                          <Link
                            href={`/s/m/inspections/${t.roomId}`}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-action px-4 text-sm font-medium text-white"
                          >
                            Inspect
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-[44px]"
                            disabled={release.isPending}
                            onClick={() => release.mutate(t.id)}
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
        </>
      )}

      {!useQueue && (
        <>
          {roomsQ.isLoading && <p className="text-sm text-ink-muted">Loading rooms…</p>}
          {!roomsQ.isLoading && needInspection.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center text-sm text-ink-muted">
              No rooms need inspection right now.
            </p>
          )}
          <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
            {needInspection.map((r) => (
              <li key={r.id}>
                <Link href={`/s/m/inspections/${r.id}`} className="block tap-scale">
                  <Card className="transition-shadow hover:shadow-lift">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold tabular-nums text-ink">
                          Room {r.roomNumber}
                        </p>
                        {r.floor != null && (
                          <p className="mt-0.5 text-xs text-ink-muted">Floor {r.floor}</p>
                        )}
                      </div>
                      <StatusBadge status={r.derivedStatus} />
                    </div>
                    <p className="mt-3 text-xs font-medium text-action">Tap for actions →</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
