'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import {
  downloadOccupancyReport,
  isRoomOccupied,
  summarizeRooms,
  type TechnicianRoomRow,
} from '@/lib/technician-room-occupancy';
import { Button } from '@/components/ui/Button';
import clsx from 'clsx';

export default function TechnicianRoomsPage() {
  const { data = [], isLoading, isFetching } = useQuery(roomsListQueryOptions<TechnicianRoomRow>());

  const { floors, occupiedCount, freeCount, oooCount } = useMemo(
    () => summarizeRooms(data),
    [data],
  );

  function onDownloadList() {
    if (data.length === 0) return;
    downloadOccupancyReport(data);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Rooms</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Green = vacant · Red = guest checked in · Based on PMS check-in status, not future reservations.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          disabled={isLoading || data.length === 0}
          onClick={onDownloadList}
        >
          {isFetching ? 'Refreshing…' : 'Download occupancy list'}
        </Button>
      </div>

      {!isLoading && data.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-green-500 px-3 py-1 font-medium text-white">
            <span className="h-2 w-2 rounded-full bg-white/90" aria-hidden />
            Free · {freeCount}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 font-medium text-white">
            <span className="h-2 w-2 rounded-full bg-white/90" aria-hidden />
            Occupied · {occupiedCount}
          </span>
          {oooCount > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-zinc-500 px-3 py-1 font-medium text-white">
              Out of order · {oooCount}
            </span>
          )}
        </div>
      )}

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      {!isLoading && floors.length === 0 && (
        <p className="text-sm text-ink-muted">No rooms found.</p>
      )}

      {!isLoading &&
        floors.map((group, idx) => (
          <section key={group.floor}>
            {idx > 0 && (
              <div className="mb-4 flex items-center gap-3" role="separator" aria-label={group.label}>
                <div className="h-px flex-1 bg-border" />
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            {idx === 0 && (
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {group.label}
              </h2>
            )}
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {group.rooms.map((r) => {
                const occupied = isRoomOccupied(r);
                const ooo = r.outOfOrder;
                return (
                  <li key={r.id}>
                    <div
                      className={clsx(
                        'flex min-h-[52px] flex-col items-center justify-center rounded-xl px-2 py-2.5 text-center shadow-sm ring-1 ring-black/10',
                        ooo
                          ? 'bg-zinc-500 text-white'
                          : occupied
                            ? 'bg-red-500 text-white'
                            : 'bg-green-500 text-white',
                      )}
                      title={
                        ooo
                          ? `Room ${r.roomNumber} — out of order`
                          : occupied
                            ? `Room ${r.roomNumber} — occupied`
                            : `Room ${r.roomNumber} — free`
                      }
                    >
                      <span className="text-base font-bold tabular-nums leading-none">{r.roomNumber}</span>
                      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/90">
                        {ooo ? 'OOO' : occupied ? 'Occupied' : 'Free'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
