'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  checklist: {
    tasks: { status: string }[];
  } | null;
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
  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<Req[]>('/service-requests'),
  });

  const rows = requests ?? [];
  const open = rows.filter((r) => r.status === 'OPEN');
  const mine = rows.filter(
    (r) =>
      r.claimedBy?.id === user?.id &&
      (r.status === 'CLAIMED' || r.status === 'IN_PROGRESS'),
  );

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
          {rooms?.map((r) => {
            const total = r.checklist?.tasks.length ?? 0;
            const done = r.checklist?.tasks.filter((t) => t.status === 'COMPLETED').length ?? 0;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <li key={r.id}>
                <Link href={`/h/room/${r.id}`} className="block tap-scale">
                  <Card className="transition-shadow hover:shadow-lift">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold tracking-tight text-ink">Room {r.roomNumber}</p>
                        {r.floor != null && (
                          <p className="mt-0.5 text-xs text-ink-muted">Floor {r.floor}</p>
                        )}
                      </div>
                      <StatusBadge status={r.derivedStatus} />
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-ink-muted">
                        <span>Checklist</span>
                        <span>
                          {done}/{total} tasks
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-success transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
        {rooms?.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">No rooms assigned right now.</p>
        )}
      </section>

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
