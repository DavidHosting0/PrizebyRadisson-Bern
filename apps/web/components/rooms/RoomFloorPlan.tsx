'use client';

import { useMemo, useState } from 'react';
import {
  compareRoomNumbers,
  floorFromRoomNumber,
  floorPlanGridCols,
  formatFloorLabel,
} from '@housekeeping/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { roomTileClass } from '@/components/rooms/roomTileStyles';

export type FloorPlanRoom = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
};

type Props = {
  rooms: FloorPlanRoom[];
  onRoomClick: (roomId: string) => void;
};

function planFloor(r: FloorPlanRoom): number | null {
  return r.floor ?? floorFromRoomNumber(r.roomNumber);
}

export function RoomFloorPlan({ rooms, onRoomClick }: Props) {
  const [activeFloor, setActiveFloor] = useState<number | 'all' | 'unplaced'>('all');

  const floors = useMemo(() => {
    const s = new Set<number>();
    rooms.forEach((r) => {
      const f = planFloor(r);
      if (f != null) s.add(f);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [rooms]);

  const unplaced = useMemo(
    () => rooms.filter((r) => planFloor(r) == null),
    [rooms],
  );

  const displayed = useMemo(() => {
    let list = [...rooms];
    if (activeFloor === 'unplaced') {
      list = unplaced;
    } else if (activeFloor !== 'all') {
      list = list.filter((r) => planFloor(r) === activeFloor);
    }
    return list.sort((a, b) => {
      const fa = planFloor(a) ?? 9999;
      const fb = planFloor(b) ?? 9999;
      if (fa !== fb) return fa - fb;
      return compareRoomNumbers(a.roomNumber, b.roomNumber);
    });
  }, [rooms, activeFloor, unplaced]);

  const byFloor = useMemo(() => {
    const m = new Map<number, FloorPlanRoom[]>();
    for (const r of rooms) {
      const f = planFloor(r);
      if (f == null) continue;
      const arr = m.get(f) ?? [];
      arr.push(r);
      m.set(f, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber));
    }
    return m;
  }, [rooms]);

  const floorKeys =
    activeFloor === 'all' ? floors : activeFloor === 'unplaced' ? [] : floors.filter((f) => f === activeFloor);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveFloor('all')}
          className={`min-h-[40px] rounded-full px-4 text-sm font-medium transition-colors ${
            activeFloor === 'all' ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted hover:text-ink'
          }`}
        >
          All floors
        </button>
        {floors.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActiveFloor(f)}
            className={`min-h-[40px] rounded-full px-4 text-sm font-medium transition-colors ${
              activeFloor === f ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted hover:text-ink'
            }`}
          >
            {formatFloorLabel(f)}
          </button>
        ))}
        {unplaced.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveFloor('unplaced')}
            className={`min-h-[40px] rounded-full px-4 text-sm font-medium transition-colors ${
              activeFloor === 'unplaced' ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted hover:text-ink'
            }`}
          >
            Unplaced ({unplaced.length})
          </button>
        )}
      </div>

      <p className="text-xs text-ink-muted">
        Each tile is a room. Colors reflect housekeeping status (dirty, in progress, clean, inspected, out of order).
        Select a floor to focus, or use All floors. Click a room for details, photos, and maintenance.
      </p>

      <div className="space-y-8">
        {activeFloor === 'unplaced' && unplaced.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
              Unplaced (no floor in database and room number not in hotel layout)
            </h2>
            <div
              className="gap-2"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${floorPlanGridCols(unplaced.length)}, minmax(0, 1fr))`,
              }}
            >
              {unplaced.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={roomTileClass(r.derivedStatus)}
                  onClick={() => onRoomClick(r.id)}
                >
                  <span className="block text-sm font-semibold tabular-nums text-ink">{r.roomNumber}</span>
                  <span className="mt-1 flex justify-center">
                    <StatusBadge status={r.derivedStatus} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {activeFloor !== 'unplaced' &&
          floorKeys.map((f) => {
            const list = byFloor.get(f) ?? [];
            if (list.length === 0) return null;
            const cols = floorPlanGridCols(list.length);
            return (
              <section key={f}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
                  {formatFloorLabel(f)}
                </h2>
                <div
                  className="gap-2"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {list.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={roomTileClass(r.derivedStatus)}
                      onClick={() => onRoomClick(r.id)}
                    >
                      <span className="block text-sm font-semibold tabular-nums text-ink">{r.roomNumber}</span>
                      <span className="mt-1 flex justify-center">
                        <StatusBadge status={r.derivedStatus} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}

        {activeFloor === 'all' && unplaced.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
              Unplaced (set floor in admin or use a known room number)
            </h2>
            <div
              className="gap-2"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${floorPlanGridCols(unplaced.length)}, minmax(0, 1fr))`,
              }}
            >
              {unplaced.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={roomTileClass(r.derivedStatus)}
                  onClick={() => onRoomClick(r.id)}
                >
                  <span className="block text-sm font-semibold tabular-nums text-ink">{r.roomNumber}</span>
                  <span className="mt-1 flex justify-center">
                    <StatusBadge status={r.derivedStatus} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {displayed.length === 0 && (
        <p className="text-sm text-ink-muted">No rooms to show for this filter.</p>
      )}
    </div>
  );
}
