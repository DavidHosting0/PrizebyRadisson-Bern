import { compareRoomNumbers, floorFromRoomNumber } from '@housekeeping/shared';
import type { HousekeeperAssignSummary } from '@housekeeping/shared';

export type AssignableRoom = {
  roomId: string;
  roomNumber: string;
  floor: number | null;
};

export type HousekeeperSlot = {
  housekeeperId: string;
  currentCount: number;
};

export type BalancedAssignment = {
  roomId: string;
  roomNumber: string;
  floor: number | null;
  housekeeperId: string;
};

type FloorChunk = {
  floor: number;
  rooms: AssignableRoom[];
};

type AssigneeState = {
  housekeeperId: string;
  rooms: AssignableRoom[];
  baseCount: number;
  target: number;
};

function roomFloor(room: AssignableRoom): number {
  return room.floor ?? floorFromRoomNumber(room.roomNumber) ?? 9999;
}

function groupIntoFloorChunks(rooms: AssignableRoom[]): FloorChunk[] {
  const byFloor = new Map<number, AssignableRoom[]>();
  for (const room of rooms) {
    const floor = roomFloor(room);
    const list = byFloor.get(floor) ?? [];
    list.push(room);
    byFloor.set(floor, list);
  }
  const chunks: FloorChunk[] = [];
  for (const [floor, floorRooms] of byFloor) {
    floorRooms.sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber));
    chunks.push({ floor, rooms: floorRooms });
  }
  return chunks;
}

function splitChunk(chunk: FloorChunk, maxSize: number): FloorChunk[] {
  if (chunk.rooms.length <= maxSize) return [chunk];
  const out: FloorChunk[] = [];
  for (let i = 0; i < chunk.rooms.length; i += maxSize) {
    out.push({ floor: chunk.floor, rooms: chunk.rooms.slice(i, i + maxSize) });
  }
  return out;
}

function totalCount(state: AssigneeState): number {
  return state.baseCount + state.rooms.length;
}

function pickAssignee(states: AssigneeState[], chunkSize: number): number {
  let best = -1;
  let bestTotal = Number.POSITIVE_INFINITY;
  for (let i = 0; i < states.length; i++) {
    const state = states[i]!;
    const next = totalCount(state) + chunkSize;
    const cap = state.baseCount + state.target + 1;
    if (next > cap) continue;
    const t = totalCount(state);
    if (t < bestTotal) {
      bestTotal = t;
      best = i;
    }
  }
  if (best >= 0) return best;
  let fallback = 0;
  for (let i = 1; i < states.length; i++) {
    if (totalCount(states[i]!) < totalCount(states[fallback]!)) fallback = i;
  }
  return fallback;
}

function summarize(states: AssigneeState[]): HousekeeperAssignSummary[] {
  return states.map((s) => {
    const floors = [...new Set(s.rooms.map((r) => roomFloor(r)).filter((f) => f !== 9999))].sort(
      (a, b) => a - b,
    );
    return {
      housekeeperId: s.housekeeperId,
      count: s.rooms.length,
      floors,
    };
  });
}

function rebalance(states: AssigneeState[]): void {
  for (let pass = 0; pass < 50; pass++) {
    const totals = states.map(totalCount);
    const max = Math.max(...totals);
    const min = Math.min(...totals);
    if (max - min <= 1) break;

    const fromIdx = totals.indexOf(max);
    const toIdx = totals.indexOf(min);
    const from = states[fromIdx];
    if (!from || from.rooms.length === 0) break;

    const movable = [...from.rooms].sort((a, b) => {
      const fa = roomFloor(a);
      const fb = roomFloor(b);
      if (fa !== fb) return fa - fb;
      return compareRoomNumbers(a.roomNumber, b.roomNumber);
    });
    const room = movable[0];
    if (!room) break;
    from.rooms = from.rooms.filter((r) => r.roomId !== room.roomId);
    states[toIdx]?.rooms.push(room);
  }
}

/**
 * Assign departure rooms to housekeepers with balanced counts and floor locality.
 */
export function balanceDepartureAssignments(
  rooms: AssignableRoom[],
  housekeepers: HousekeeperSlot[],
): { assignments: BalancedAssignment[]; summaries: HousekeeperAssignSummary[] } {
  if (housekeepers.length === 0 || rooms.length === 0) {
    return { assignments: [], summaries: [] };
  }

  const n = housekeepers.length;
  const total = rooms.length;
  const base = Math.floor(total / n);
  const remainder = total % n;
  const softCap = base + (remainder > 0 ? 1 : 0);

  const states: AssigneeState[] = housekeepers.map((hk, i) => ({
    housekeeperId: hk.housekeeperId,
    rooms: [],
    baseCount: hk.currentCount,
    target: base + (i < remainder ? 1 : 0),
  }));

  let chunks = groupIntoFloorChunks(rooms);
  chunks = chunks.flatMap((c) => splitChunk(c, Math.max(softCap, 1)));
  chunks.sort((a, b) => b.rooms.length - a.rooms.length || a.floor - b.floor);

  for (const chunk of chunks) {
    const idx = pickAssignee(states, chunk.rooms.length);
    states[idx]!.rooms.push(...chunk.rooms);
  }

  rebalance(states);

  const assignments: BalancedAssignment[] = [];
  for (const state of states) {
    for (const room of state.rooms) {
      assignments.push({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        floor: room.floor ?? floorFromRoomNumber(room.roomNumber),
        housekeeperId: state.housekeeperId,
      });
    }
  }

  assignments.sort((a, b) => {
    if (a.housekeeperId !== b.housekeeperId) return a.housekeeperId.localeCompare(b.housekeeperId);
    const fa = a.floor ?? 9999;
    const fb = b.floor ?? 9999;
    if (fa !== fb) return fa - fb;
    return compareRoomNumbers(a.roomNumber, b.roomNumber);
  });

  return { assignments, summaries: summarize(states) };
}
