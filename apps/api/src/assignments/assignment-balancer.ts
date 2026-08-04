import { compareRoomNumbers, floorFromRoomNumber, HOTEL_TIME_ZONE } from '@housekeeping/shared';
import type { DailyCleaningSummary } from '@housekeeping/shared';

export type WorkItemKind = 'ROOM' | 'PUBLIC_AREA';
export type WorkItemType = 'DIRTY' | 'RESTANT' | 'PUBLIC';

export type BalanceWorkItem = {
  key: string;
  kind: WorkItemKind;
  workType: WorkItemType;
  roomId?: string;
  roomNumber?: string;
  floor: number | null;
  publicAreaId?: string;
  pinned: boolean;
  assigneeUserId: string | null;
};

export type EligibleCleaner = {
  housekeeperId: string;
  isLateShift: boolean;
  /** Relative room capacity: 1 = normal, ~0.55 = late shift. */
  roomWeight: number;
};

export type BalancedAssignment = {
  key: string;
  housekeeperId: string;
};

const LATE_ROOM_WEIGHT = 0.55;

function roomFloor(item: BalanceWorkItem): number {
  if (item.floor != null) return item.floor;
  if (item.roomNumber) return floorFromRoomNumber(item.roomNumber) ?? 9999;
  return 9999;
}

function summarize(
  cleaners: EligibleCleaner[],
  assigned: Map<string, string>,
  items: BalanceWorkItem[],
): DailyCleaningSummary[] {
  const byHk = new Map<string, DailyCleaningSummary>();
  for (const c of cleaners) {
    byHk.set(c.housekeeperId, {
      housekeeperId: c.housekeeperId,
      roomCount: 0,
      restantCount: 0,
      publicCount: 0,
      floors: [],
    });
  }
  const floorsByHk = new Map<string, Set<number>>();
  for (const item of items) {
    const hkId = assigned.get(item.key) ?? item.assigneeUserId;
    if (!hkId) continue;
    let row = byHk.get(hkId);
    if (!row) {
      row = {
        housekeeperId: hkId,
        roomCount: 0,
        restantCount: 0,
        publicCount: 0,
        floors: [],
      };
      byHk.set(hkId, row);
    }
    if (item.workType === 'RESTANT') row.restantCount += 1;
    else if (item.workType === 'PUBLIC') row.publicCount += 1;
    else row.roomCount += 1;
    const floor = roomFloor(item);
    if (floor !== 9999) {
      const set = floorsByHk.get(hkId) ?? new Set<number>();
      set.add(floor);
      floorsByHk.set(hkId, set);
    }
  }
  for (const [hkId, floors] of floorsByHk) {
    const row = byHk.get(hkId);
    if (row) row.floors = [...floors].sort((a, b) => a - b);
  }
  return [...byHk.values()];
}

/**
 * Multi-type daily balancer:
 * - pinned / already-assigned stay fixed
 * - all RESTANT items go to one assignee (preferredRestantId or auto-picked non-late)
 * - DIRTY rooms balance by floor with late shift getting fewer rooms
 * - PUBLIC areas go to publicAssigneeIds when set, else prefer late shift
 */
export function balanceDailyCleaningAssignments(
  items: BalanceWorkItem[],
  cleaners: EligibleCleaner[],
  options?: {
    preferredRestantId?: string | null;
    publicAssigneeIds?: string[];
  },
): { assignments: BalancedAssignment[]; summaries: DailyCleaningSummary[] } {
  const assigned = new Map<string, string>();
  const preferredRestantId = options?.preferredRestantId ?? null;
  const publicAssigneeIds = options?.publicAssigneeIds?.filter(Boolean) ?? [];

  for (const item of items) {
    if (item.pinned && item.assigneeUserId) {
      assigned.set(item.key, item.assigneeUserId);
    }
  }

  if (cleaners.length === 0 && !preferredRestantId && publicAssigneeIds.length === 0) {
    return {
      assignments: [...assigned.entries()].map(([key, housekeeperId]) => ({ key, housekeeperId })),
      summaries: summarize(cleaners, assigned, items),
    };
  }

  const roomLoad = new Map<string, number>();
  const publicLoad = new Map<string, number>();
  for (const c of cleaners) {
    roomLoad.set(c.housekeeperId, 0);
    publicLoad.set(c.housekeeperId, 0);
  }
  for (const id of [preferredRestantId, ...publicAssigneeIds]) {
    if (id && !roomLoad.has(id)) {
      roomLoad.set(id, 0);
      publicLoad.set(id, 0);
    }
  }
  for (const item of items) {
    const hk = assigned.get(item.key);
    if (!hk) continue;
    if (item.workType === 'PUBLIC') {
      publicLoad.set(hk, (publicLoad.get(hk) ?? 0) + 1);
    } else {
      roomLoad.set(hk, (roomLoad.get(hk) ?? 0) + 1);
    }
  }

  // --- Restant bundle → one assignee ---
  const restants = items.filter((i) => i.workType === 'RESTANT' && !assigned.has(i.key));
  if (restants.length > 0) {
    let restantHk = preferredRestantId;
    if (!restantHk) {
      const nonLate = cleaners.filter((c) => !c.isLateShift);
      const pool = nonLate.length > 0 ? nonLate : cleaners;
      if (pool.length > 0) {
        let best = pool[0]!;
        for (const c of pool) {
          if ((roomLoad.get(c.housekeeperId) ?? 0) < (roomLoad.get(best.housekeeperId) ?? 0)) {
            best = c;
          }
        }
        restantHk = best.housekeeperId;
      }
    }
    if (restantHk) {
      for (const item of restants) {
        assigned.set(item.key, restantHk);
        roomLoad.set(restantHk, (roomLoad.get(restantHk) ?? 0) + 1);
      }
    }
  }

  // --- Dirty rooms: weighted floor balance ---
  const dirty = items.filter((i) => i.workType === 'DIRTY' && !assigned.has(i.key));
  if (dirty.length > 0 && cleaners.length > 0) {
    const weightSum = cleaners.reduce((s, c) => s + c.roomWeight, 0) || cleaners.length;
    const targets = new Map<string, number>();
    let allocated = 0;
    for (const c of cleaners) {
      const t = Math.floor((dirty.length * c.roomWeight) / weightSum);
      targets.set(c.housekeeperId, t);
      allocated += t;
    }
    let rem = dirty.length - allocated;
    const ordered = [...cleaners].sort((a, b) => b.roomWeight - a.roomWeight);
    for (const c of ordered) {
      if (rem <= 0) break;
      targets.set(c.housekeeperId, (targets.get(c.housekeeperId) ?? 0) + 1);
      rem -= 1;
    }

    const byFloor = new Map<number, BalanceWorkItem[]>();
    for (const item of dirty) {
      const f = roomFloor(item);
      const list = byFloor.get(f) ?? [];
      list.push(item);
      byFloor.set(f, list);
    }
    for (const list of byFloor.values()) {
      list.sort((a, b) => compareRoomNumbers(a.roomNumber ?? '', b.roomNumber ?? ''));
    }
    const floors = [...byFloor.keys()].sort((a, b) => a - b);

    for (const floor of floors) {
      const rooms = byFloor.get(floor) ?? [];
      for (const item of rooms) {
        let best: EligibleCleaner | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const c of cleaners) {
          const load = roomLoad.get(c.housekeeperId) ?? 0;
          const target = targets.get(c.housekeeperId) ?? 0;
          const over = Math.max(0, load - target);
          const score = load / Math.max(c.roomWeight, 0.1) + over * 10;
          if (score < bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (!best) continue;
        assigned.set(item.key, best.housekeeperId);
        roomLoad.set(best.housekeeperId, (roomLoad.get(best.housekeeperId) ?? 0) + 1);
      }
    }
  }

  // --- Public areas ---
  const publics = items.filter((i) => i.workType === 'PUBLIC' && !assigned.has(i.key));
  if (publics.length > 0) {
    if (publicAssigneeIds.length > 0) {
      let idx = 0;
      for (const item of publics) {
        const hk = publicAssigneeIds[idx % publicAssigneeIds.length]!;
        idx += 1;
        assigned.set(item.key, hk);
        publicLoad.set(hk, (publicLoad.get(hk) ?? 0) + 1);
      }
    } else if (cleaners.length > 0) {
      const late = cleaners.filter((c) => c.isLateShift);
      const early = cleaners.filter((c) => !c.isLateShift);
      for (const item of publics) {
        let best = (late[0] ?? early[0] ?? cleaners[0])!;
        const pool = late.length > 0 ? late : early.length > 0 ? early : cleaners;
        for (const c of pool) {
          if ((publicLoad.get(c.housekeeperId) ?? 0) < (publicLoad.get(best.housekeeperId) ?? 0)) {
            best = c;
          }
        }
        assigned.set(item.key, best.housekeeperId);
        publicLoad.set(best.housekeeperId, (publicLoad.get(best.housekeeperId) ?? 0) + 1);
      }
    }
  }

  return {
    assignments: [...assigned.entries()].map(([key, housekeeperId]) => ({ key, housekeeperId })),
    summaries: summarize(cleaners, assigned, items),
  };
}

export { LATE_ROOM_WEIGHT };

/** Local minutes since midnight in hotel TZ. */
export function hotelLocalMinutes(d: Date, timeZone = HOTEL_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

/** Detect ~11:00–20:00 late shift from raw shift window. */
export function isLateShiftWindow(startsAt: Date, endsAt: Date, timeZone = HOTEL_TIME_ZONE): boolean {
  const start = hotelLocalMinutes(startsAt, timeZone);
  const end = hotelLocalMinutes(endsAt, timeZone);
  const startOk = start >= 10 * 60 + 30 && start <= 11 * 60 + 30;
  const endOk = end >= 19 * 60 + 30 && end <= 20 * 60 + 30;
  return startOk && endOk;
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00.000Z`);
  const b = Date.parse(`${toIso}T00:00:00.000Z`);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isPublicAreaDue(opts: {
  lastCompletedOn: string | null;
  frequencyDays: number;
  dateIso: string;
}): boolean {
  if (opts.frequencyDays < 1) return true;
  if (!opts.lastCompletedOn) return true;
  return daysBetweenIso(opts.lastCompletedOn, opts.dateIso) >= opts.frequencyDays;
}

export function dayBoundsFromIso(iso: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid date ${iso}`);
  const from = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export function dateOnlyFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
