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

type Rect = { x: number; y: number; w: number; h: number };

function planFloor(r: FloorPlanRoom): number | null {
  return r.floor ?? floorFromRoomNumber(r.roomNumber);
}

function roomSuffix(roomNumber: string, floor: number): number | null {
  const n = parseInt(roomNumber, 10);
  if (!Number.isFinite(n)) return null;
  if (floor >= 1) return n - floor * 100;
  return n;
}

function roomButton(room: FloorPlanRoom, onRoomClick: (roomId: string) => void) {
  return (
    <button
      key={room.id}
      type="button"
      className={roomTileClass(room.derivedStatus)}
      onClick={() => onRoomClick(room.id)}
    >
      <span className="block text-sm font-semibold tabular-nums text-ink">{room.roomNumber}</span>
      <span className="mt-1 flex justify-center">
        <StatusBadge status={room.derivedStatus} />
      </span>
    </button>
  );
}

function floorOneToSixPosition(suffix: number): Rect | null {
  const map: Record<number, Rect> = {
    1: { x: 1, y: 1, w: 2, h: 1 },
    2: { x: 5, y: 1, w: 2, h: 1 },
    3: { x: 1, y: 2, w: 2, h: 1 },
    4: { x: 5, y: 2, w: 2, h: 1 },
    5: { x: 1, y: 3, w: 2, h: 1 },
    6: { x: 5, y: 3, w: 2, h: 1 },
    7: { x: 1, y: 4, w: 2, h: 1 },
    8: { x: 5, y: 4, w: 2, h: 1 },
    9: { x: 1, y: 5, w: 2, h: 1 },
    10: { x: 5, y: 5, w: 2, h: 1 },
    11: { x: 1, y: 6, w: 2, h: 1 },
    12: { x: 5, y: 6, w: 2, h: 1 },
    14: { x: 8, y: 7, w: 2, h: 1 },
    15: { x: 10, y: 7, w: 2, h: 1 },
    16: { x: 12, y: 7, w: 2, h: 1 },
    17: { x: 15, y: 7, w: 2, h: 1 },
    18: { x: 17, y: 7, w: 2, h: 1 },
    19: { x: 20, y: 7, w: 2, h: 1 },
    20: { x: 22, y: 7, w: 2, h: 1 },
    21: { x: 15, y: 8, w: 2, h: 1 },
    22: { x: 17, y: 8, w: 2, h: 1 },
    23: { x: 20, y: 8, w: 2, h: 1 },
    24: { x: 22, y: 8, w: 2, h: 1 },
  };
  return map[suffix] ?? null;
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

  const singleFloorRooms = useMemo(() => {
    if (typeof activeFloor !== 'number') return [];
    return (byFloor.get(activeFloor) ?? []).slice();
  }, [activeFloor, byFloor]);

  const oneToSixLayout = useMemo(() => {
    if (typeof activeFloor !== 'number' || activeFloor < 1 || activeFloor > 6) return null;
    const positioned: Array<{ room: FloorPlanRoom; rect: Rect }> = [];
    const fallback: FloorPlanRoom[] = [];
    for (const r of singleFloorRooms) {
      const suffix = roomSuffix(r.roomNumber, activeFloor);
      if (suffix == null) {
        fallback.push(r);
        continue;
      }
      const rect = floorOneToSixPosition(suffix);
      if (!rect) fallback.push(r);
      else positioned.push({ room: r, rect });
    }
    return { positioned, fallback };
  }, [activeFloor, singleFloorRooms]);

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

        {typeof activeFloor === 'number' && oneToSixLayout && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
              {formatFloorLabel(activeFloor)} - real layout (corridor + elevator)
            </h2>
            <div className="overflow-x-auto rounded-card border border-border bg-surface p-3">
              <div
                className="relative min-w-[900px]"
                style={{ height: 430 }}
              >
                <div className="absolute left-[8%] top-[2%] h-[75%] w-[18%] rounded-md border border-border/50 bg-surface-muted/50" />
                <div className="absolute bottom-[2%] left-[2%] h-[12%] w-[96%] rounded-md border border-border/50 bg-surface-muted/50" />
                <div className="absolute bottom-[12%] left-[8%] h-[12%] w-[44%] rounded-md border border-border/50 bg-surface-muted/50" />
                <div className="absolute bottom-[8%] left-[17%] h-[15%] w-[14%] rounded-md border border-dashed border-border bg-surface text-center text-[11px] text-ink-muted">
                  <span className="relative top-[40%]">Elevator</span>
                </div>

                {oneToSixLayout.positioned.map(({ room, rect }) => (
                  <div
                    key={room.id}
                    className="absolute p-1"
                    style={{
                      left: `${((rect.x - 1) / 24) * 100}%`,
                      top: `${((rect.y - 1) / 9) * 100}%`,
                      width: `${(rect.w / 24) * 100}%`,
                      height: `${(rect.h / 9) * 100}%`,
                    }}
                  >
                    {roomButton(room, onRoomClick)}
                  </div>
                ))}
              </div>
            </div>
            {oneToSixLayout.fallback.length > 0 && (
              <div className="mt-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Rooms without mapped physical slot
                </h3>
                <div
                  className="gap-2"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${floorPlanGridCols(oneToSixLayout.fallback.length)}, minmax(0, 1fr))`,
                  }}
                >
                  {oneToSixLayout.fallback.map((r) => roomButton(r, onRoomClick))}
                </div>
              </div>
            )}
          </section>
        )}

        {activeFloor !== 'unplaced' &&
          !(typeof activeFloor === 'number' && activeFloor >= 1 && activeFloor <= 6) &&
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
                  {list.map((r) => roomButton(r, onRoomClick))}
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
