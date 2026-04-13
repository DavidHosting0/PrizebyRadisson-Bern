'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';

type RoomRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
};

export default function SupervisorMobileInspectionsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api<RoomRow[]>('/rooms'),
  });

  const needInspection = data.filter((r) => r.derivedStatus === 'CLEAN').sort((a, b) => {
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
          Rooms that are fully cleaned and waiting for your inspection (status: clean).
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading rooms…</p>}

      {!isLoading && needInspection.length === 0 && (
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
                    <p className="text-lg font-semibold tabular-nums text-ink">Room {r.roomNumber}</p>
                    {r.floor != null && <p className="mt-0.5 text-xs text-ink-muted">Floor {r.floor}</p>}
                  </div>
                  <StatusBadge status={r.derivedStatus} />
                </div>
                <p className="mt-3 text-xs font-medium text-action">Tap for actions →</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
