'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';

type RoomRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  outOfOrder: boolean;
};

function occupancyLabel(status: string): 'empty' | 'notEmpty' | 'ooo' {
  if (status === 'OUT_OF_ORDER') return 'ooo';
  if (status === 'INSPECTED' || status === 'CLEAN') return 'empty';
  return 'notEmpty';
}

export default function TechnicianRoomsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api<RoomRow[]>('/rooms'),
  });

  const { empty, notEmpty, ooo } = useMemo(() => {
    const empty: RoomRow[] = [];
    const notEmpty: RoomRow[] = [];
    const ooo: RoomRow[] = [];
    for (const r of data) {
      const o = occupancyLabel(r.derivedStatus);
      if (o === 'ooo') ooo.push(r);
      else if (o === 'empty') empty.push(r);
      else notEmpty.push(r);
    }
    const byRoom = (a: RoomRow, b: RoomRow) =>
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    empty.sort(byRoom);
    notEmpty.sort(byRoom);
    ooo.sort(byRoom);
    return { empty, notEmpty, ooo };
  }, [data]);

  function Section({
    title,
    hint,
    rooms,
  }: {
    title: string;
    hint: string;
    rooms: RoomRow[];
  }) {
    return (
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <span className="text-xs tabular-nums text-ink-muted">{rooms.length}</span>
        </div>
        <p className="text-xs text-ink-muted">{hint}</p>
        {rooms.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted/50 px-3 py-4 text-center text-sm text-ink-muted">
            None
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rooms.map((r) => (
              <li key={r.id}>
                <Card className="p-3">
                  <p className="text-base font-semibold tabular-nums text-ink">{r.roomNumber}</p>
                  {r.floor != null && <p className="text-xs text-ink-muted">Floor {r.floor}</p>}
                  <div className="mt-2">
                    <StatusBadge status={r.derivedStatus} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Rooms</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Empty vs not empty follows housekeeping status (clean / inspected vs dirty or in progress), not the PMS guest list.
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      {!isLoading && (
        <>
          <Section
            title="Empty"
            hint="Clean or inspected — typically ready for arrival."
            rooms={empty}
          />
          <Section
            title="Not empty"
            hint="Dirty or cleaning in progress — assume occupied or turnover."
            rooms={notEmpty}
          />
          <Section title="Out of order" hint="Unavailable for guests." rooms={ooo} />
        </>
      )}
    </div>
  );
}
