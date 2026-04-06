'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  compareRoomNumbers,
  floorFromRoomNumber,
  floorPlanGridCols,
  formatFloorLabel,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { FloorPlanCanvasFrame, floorTabClass } from '@/components/rooms/FloorPlanChrome';
import { roomPlanCompactClass, roomTileClass } from '@/components/rooms/roomTileStyles';

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
type SavedLayoutElement = {
  id: string;
  kind: 'room' | 'staff' | 'elevator' | 'corridor' | 'glass';
  x: number;
  y: number;
  w: number;
  h: number;
  roomNumber?: string;
};

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
        <StatusBadge status={room.derivedStatus} variant="onColor" />
      </span>
    </button>
  );
}

function roomPlanButton(room: FloorPlanRoom, onRoomClick: (roomId: string) => void) {
  return (
    <button
      key={room.id}
      type="button"
      onClick={() => onRoomClick(room.id)}
      className={`flex h-full w-full items-center justify-center px-0.5 py-1 ${roomPlanCompactClass(room.derivedStatus)}`}
      title={`Room ${room.roomNumber} · ${room.derivedStatus.replace(/_/g, ' ')}`}
    >
      {room.roomNumber}
    </button>
  );
}

function corridorLabel(floor: number, ordinal: number): string {
  return `Corridor ${floor}.${ordinal}`;
}

const corridorZoneClass =
  'flex items-center justify-center overflow-hidden rounded-lg border border-[#6f6a63]/35 bg-gradient-to-br from-[#d8d3cb]/95 to-[#c0bbb3]/90 p-1 text-center shadow-[inset_0_1px_2px_rgba(255,255,255,0.55)]';

const corridorTextClass =
  'text-[10px] font-bold uppercase leading-tight tracking-wide text-[#2d2a26] sm:text-[11px]';

function floorOneToSixPosition(suffix: number): Rect | null {
  const map: Record<number, Rect> = {
    // Bottom run from left staff corner toward turning corner: 201..209
    1: { x: 7, y: 12, w: 2, h: 1 },
    2: { x: 9, y: 12, w: 2, h: 1 },
    3: { x: 11, y: 12, w: 2, h: 1 },
    4: { x: 13, y: 12, w: 2, h: 1 },
    5: { x: 15, y: 12, w: 2, h: 1 },
    6: { x: 17, y: 12, w: 2, h: 1 },
    7: { x: 19, y: 12, w: 2, h: 1 },
    8: { x: 21, y: 12, w: 2, h: 1 },
    9: { x: 23, y: 12, w: 2, h: 1 },
    // Opposite corner and back run: 210..218
    10: { x: 4, y: 11, w: 2, h: 1 },
    11: { x: 4, y: 10, w: 2, h: 1 },
    12: { x: 4, y: 9, w: 2, h: 1 },
    14: { x: 4, y: 8, w: 2, h: 1 },
    15: { x: 4, y: 7, w: 2, h: 1 },
    16: { x: 4, y: 6, w: 2, h: 1 },
    17: { x: 4, y: 5, w: 2, h: 1 },
    18: { x: 4, y: 4, w: 2, h: 1 },
    // Right wing: 219..224
    19: { x: 27, y: 11, w: 2, h: 1 },
    20: { x: 27, y: 10, w: 2, h: 1 },
    21: { x: 27, y: 9, w: 2, h: 1 },
    22: { x: 27, y: 8, w: 2, h: 1 },
    23: { x: 27, y: 7, w: 2, h: 1 },
    24: { x: 27, y: 6, w: 2, h: 1 },
  };
  return map[suffix] ?? null;
}

export function RoomFloorPlan({ rooms, onRoomClick }: Props) {
  const [activeFloor, setActiveFloor] = useState<number | 'all' | 'unplaced'>('all');
  const activeFloorNumber = typeof activeFloor === 'number' ? activeFloor : null;

  const { data: savedPlan } = useQuery({
    queryKey: ['floor-plan-layout', activeFloorNumber],
    enabled: activeFloorNumber != null,
    queryFn: () => api<{ floor: number; layout: SavedLayoutElement[] } | null>(`/floor-plans/${activeFloorNumber}`),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: activeFloorNumber != null ? 15000 : false,
  });
  const { data: allSavedPlans = [] } = useQuery({
    queryKey: ['floor-plan-layouts'],
    queryFn: () => api<Array<{ floor: number }>>('/floor-plans'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const floors = useMemo(() => {
    const s = new Set<number>();
    rooms.forEach((r) => {
      const f = planFloor(r);
      if (f != null) s.add(f);
    });
    allSavedPlans.forEach((p) => {
      if (typeof p.floor === 'number') s.add(p.floor);
    });
    // Non-room levels that should always be available.
    s.add(-2); // Lobby
    s.add(8); // Rooftop Bar
    return Array.from(s).sort((a, b) => a - b);
  }, [rooms, allSavedPlans]);

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

  const roomByNumber = useMemo(() => {
    const m = new Map<string, FloorPlanRoom>();
    for (const r of singleFloorRooms) m.set(r.roomNumber, r);
    return m;
  }, [singleFloorRooms]);

  const corridorOrdinalById = useMemo(() => {
    const layout = savedPlan?.layout;
    if (!layout?.length) return new Map<string, number>();
    const corridors = layout
      .filter((e) => e.kind === 'corridor')
      .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    return new Map(corridors.map((e, i) => [e.id, i + 1]));
  }, [savedPlan?.layout]);

  return (
    <div className="space-y-6">
      <nav
        aria-label="Floor"
        className="flex w-full max-w-full overflow-x-auto rounded-xl border border-border/60 bg-gradient-to-b from-[#f0efeb] to-[#e4e2dc] p-1 shadow-[inset_0_1px_2px_rgba(43,43,43,0.07)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-min flex-1 flex-wrap gap-1 sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setActiveFloor('all')}
            className={`min-h-[40px] shrink-0 rounded-lg px-3.5 text-sm font-medium transition-colors sm:px-4 ${floorTabClass(activeFloor === 'all')}`}
          >
            All floors
          </button>
          {floors.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setActiveFloor(f)}
              className={`min-h-[40px] shrink-0 rounded-lg px-3.5 text-sm font-medium transition-colors sm:px-4 ${floorTabClass(activeFloor === f)}`}
            >
              {formatFloorLabel(f)}
            </button>
          ))}
          {unplaced.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveFloor('unplaced')}
              className={`min-h-[40px] shrink-0 rounded-lg px-3.5 text-sm font-medium transition-colors sm:px-4 ${floorTabClass(activeFloor === 'unplaced')}`}
            >
              Unplaced ({unplaced.length})
            </button>
          )}
        </div>
      </nav>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border/50 bg-white/70 px-4 py-2.5 text-[11px] shadow-sm backdrop-blur-sm">
        <span className="font-semibold text-ink">Room status</span>
        <span className="inline-flex items-center gap-2 text-ink-muted">
          <span className="h-3.5 w-7 shrink-0 rounded border border-red-900/35 bg-gradient-to-b from-red-600 to-red-700 shadow-sm" />
          Dirty
        </span>
        <span className="inline-flex items-center gap-2 text-ink-muted">
          <span className="h-3.5 w-7 shrink-0 rounded border border-orange-900/35 bg-gradient-to-b from-orange-500 to-orange-600 shadow-sm" />
          Clean
        </span>
        <span className="inline-flex items-center gap-2 text-ink-muted">
          <span className="h-3.5 w-7 shrink-0 rounded border border-emerald-900/35 bg-gradient-to-b from-emerald-600 to-emerald-700 shadow-sm" />
          Inspected
        </span>
        <span className="inline-flex items-center gap-2 text-ink-muted">
          <span className="h-3.5 w-7 shrink-0 rounded border border-amber-800/45 bg-gradient-to-b from-amber-400 to-amber-500 shadow-sm" />
          In progress
        </span>
        <span className="inline-flex items-center gap-2 text-ink-muted">
          <span className="h-3.5 w-7 shrink-0 rounded border border-violet-950/40 bg-gradient-to-b from-violet-600 to-violet-700 shadow-sm" />
          Out of order
        </span>
      </div>

      <p className="text-xs text-ink-muted">
        Corridors use numbered labels (e.g. Corridor 2.1) per floor. Select a floor to focus, or use All floors.
        Click a room for details, photos, and maintenance.
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
                    <StatusBadge status={r.derivedStatus} variant="onColor" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {typeof activeFloor === 'number' && savedPlan?.layout?.length ? (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-ink">{formatFloorLabel(activeFloor)}</h2>
              <span className="inline-flex items-center rounded-full border border-border/50 bg-white/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted shadow-sm backdrop-blur-sm">
                Custom admin layout
              </span>
            </div>
            <FloorPlanCanvasFrame>
              <div className="relative min-w-[1100px]" style={{ height: 540 }}>
                {savedPlan.layout.map((el) => {
                  const left = `${((el.x - 1) / 30) * 100}%`;
                  const top = `${((el.y - 1) / 14) * 100}%`;
                  const width = `${(el.w / 30) * 100}%`;
                  const height = `${(el.h / 14) * 100}%`;

                  if (el.kind === 'room' && el.roomNumber) {
                    const room = roomByNumber.get(el.roomNumber);
                    if (!room) return null;
                    return (
                      <div
                        key={el.id}
                        className="absolute p-1"
                        style={{ left, top, width, height }}
                      >
                        {roomPlanButton(room, onRoomClick)}
                      </div>
                    );
                  }

                  if (el.kind === 'corridor') {
                    const ord = corridorOrdinalById.get(el.id) ?? 1;
                    return (
                      <div
                        key={el.id}
                        className={`absolute ${corridorZoneClass}`}
                        style={{ left, top, width, height }}
                      >
                        <span className={corridorTextClass}>{corridorLabel(activeFloor, ord)}</span>
                      </div>
                    );
                  }

                  const base =
                    el.kind === 'glass'
                      ? 'rounded-lg border border-cyan-600/40 bg-gradient-to-br from-cyan-100/90 to-cyan-200/70 text-center shadow-sm'
                      : el.kind === 'elevator'
                        ? 'rounded-lg border border-dashed border-[#5c5852]/50 bg-[#eae6de]/90 text-center shadow-inner'
                        : 'rounded-lg border border-[#6f6a63]/30 bg-gradient-to-br from-[#e4e1da] to-[#d3cfc7] p-2 text-center text-xs font-bold uppercase tracking-wide text-[#3d3a36] shadow-sm';

                  return (
                    <div
                      key={el.id}
                      className={`absolute flex items-center justify-center ${base}`}
                      style={{ left, top, width, height }}
                    >
                      {el.kind === 'elevator' ? (
                        <span className="text-[11px] font-semibold text-[#4a4640]">Elevator</span>
                      ) : el.kind === 'glass' ? (
                        <span className="text-[11px] font-semibold text-cyan-900">Glass</span>
                      ) : el.kind === 'staff' ? (
                        <span className="text-[11px] font-semibold text-[#4a4640]">Staff</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </FloorPlanCanvasFrame>
          </section>
        ) : typeof activeFloor === 'number' && oneToSixLayout ? (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-ink">{formatFloorLabel(activeFloor)}</h2>
              <span className="inline-flex items-center rounded-full border border-border/50 bg-white/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted shadow-sm backdrop-blur-sm">
                Physical layout
              </span>
            </div>
            <FloorPlanCanvasFrame>
              <div
                className="relative min-w-[1100px]"
                style={{ height: 540 }}
              >
                <div className={`absolute left-[9%] top-[6%] h-[74%] w-[14%] ${corridorZoneClass}`}>
                  <span className={corridorTextClass}>{corridorLabel(activeFloor, 1)}</span>
                </div>
                <div className={`absolute bottom-[6%] left-[4%] h-[12%] w-[90%] ${corridorZoneClass}`}>
                  <span className={corridorTextClass}>{corridorLabel(activeFloor, 2)}</span>
                </div>
                <div className={`absolute bottom-[18%] left-[9%] h-[12%] w-[42%] ${corridorZoneClass}`}>
                  <span className={corridorTextClass}>{corridorLabel(activeFloor, 3)}</span>
                </div>
                <div className="absolute bottom-[14%] left-[16%] h-[12%] w-[12%] rounded-md border border-dashed border-ink/20 bg-white/50 text-center text-[11px] font-medium text-ink-muted shadow-sm">
                  <span className="relative top-[34%]">Elevator</span>
                </div>
                <div className="absolute bottom-[6%] left-[4%] w-[6%] rounded-md border border-ink/12 bg-white/45 p-2 text-center text-xs font-semibold text-ink-muted shadow-sm">
                  Staff
                </div>
                <div className="absolute bottom-[6%] left-[52%] w-[6%] rounded-md border border-ink/12 bg-white/45 p-2 text-center text-xs font-semibold text-ink-muted shadow-sm">
                  Staff
                </div>

                {oneToSixLayout.positioned.map(({ room, rect }) => (
                  <div
                    key={room.id}
                    className="absolute p-1"
                    style={{
                      left: `${((rect.x - 1) / 30) * 100}%`,
                      top: `${((rect.y - 1) / 14) * 100}%`,
                      width: `${(rect.w / 30) * 100}%`,
                      height: `${(rect.h / 14) * 100}%`,
                    }}
                  >
                    {roomPlanButton(room, onRoomClick)}
                  </div>
                ))}
              </div>
            </FloorPlanCanvasFrame>
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
        ) : null}

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
                    <StatusBadge status={r.derivedStatus} variant="onColor" />
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
