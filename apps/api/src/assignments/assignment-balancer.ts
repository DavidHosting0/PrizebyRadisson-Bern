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
/**
 * Dirty-room capacity multiplier for a full restant share.
 * >1 → restant holders get more dirty rooms; scaled by each person's restant share.
 */
const RESTANT_DIRTY_FACTOR = 1.35;

function roomFloor(item: BalanceWorkItem): number {
  if (item.floor != null) return item.floor;
  if (item.roomNumber) return floorFromRoomNumber(item.roomNumber) ?? 9999;
  return 9999;
}

function compareDirtyRooms(a: BalanceWorkItem, b: BalanceWorkItem): number {
  const fa = roomFloor(a);
  const fb = roomFloor(b);
  if (fa !== fb) return fa - fb;
  return compareRoomNumbers(a.roomNumber ?? '', b.roomNumber ?? '');
}

/** Allocate integer targets that sum to `total` proportional to weights. */
function allocateTargets(
  ids: string[],
  weights: Map<string, number>,
  total: number,
): Map<string, number> {
  const targets = new Map<string, number>();
  if (total <= 0 || ids.length === 0) {
    for (const id of ids) targets.set(id, 0);
    return targets;
  }
  const weightSum = ids.reduce((s, id) => s + (weights.get(id) ?? 0), 0) || ids.length;
  let allocated = 0;
  for (const id of ids) {
    const w = weights.get(id) ?? 0;
    const t = Math.floor((total * w) / weightSum);
    targets.set(id, t);
    allocated += t;
  }
  let rem = total - allocated;
  const ordered = [...ids].sort((a, b) => {
    const dw = (weights.get(b) ?? 0) - (weights.get(a) ?? 0);
    if (dw !== 0) return dw;
    return a.localeCompare(b);
  });
  for (const id of ordered) {
    if (rem <= 0) break;
    targets.set(id, (targets.get(id) ?? 0) + 1);
    rem -= 1;
  }
  return targets;
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
 * - RESTANT items are split across preferredRestantIds (or one auto-picked non-late)
 * - DIRTY rooms carved as contiguous blocks (floor + room order); late get fewer;
 *   restant holders get more dirty rooms proportional to their restant share
 * - PUBLIC areas go to publicAssigneeIds when set, else prefer late shift
 */
export function balanceDailyCleaningAssignments(
  items: BalanceWorkItem[],
  cleaners: EligibleCleaner[],
  options?: {
    /** @deprecated Prefer preferredRestantIds */
    preferredRestantId?: string | null;
    preferredRestantIds?: string[];
    publicAssigneeIds?: string[];
    /** Exact dirty-room counts per housekeeper (must cover all dirty work). */
    dirtyRoomTargets?: Map<string, number>;
  },
): { assignments: BalancedAssignment[]; summaries: DailyCleaningSummary[] } {
  const assigned = new Map<string, string>();
  const preferredRestantIds = [
    ...new Set(
      [
        ...(options?.preferredRestantIds ?? []),
        options?.preferredRestantId ?? null,
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const publicAssigneeIds = options?.publicAssigneeIds?.filter(Boolean) ?? [];

  for (const item of items) {
    if (item.pinned && item.assigneeUserId) {
      assigned.set(item.key, item.assigneeUserId);
    }
  }

  if (cleaners.length === 0 && preferredRestantIds.length === 0 && publicAssigneeIds.length === 0) {
    return {
      assignments: [...assigned.entries()].map(([key, housekeeperId]) => ({ key, housekeeperId })),
      summaries: summarize(cleaners, assigned, items),
    };
  }

  const roomLoad = new Map<string, number>();
  const publicLoad = new Map<string, number>();
  const dirtyAssignedCount = new Map<string, number>();
  const restantCountByHk = new Map<string, number>();
  for (const c of cleaners) {
    roomLoad.set(c.housekeeperId, 0);
    publicLoad.set(c.housekeeperId, 0);
    dirtyAssignedCount.set(c.housekeeperId, 0);
    restantCountByHk.set(c.housekeeperId, 0);
  }
  for (const id of [...preferredRestantIds, ...publicAssigneeIds]) {
    if (id && !roomLoad.has(id)) {
      roomLoad.set(id, 0);
      publicLoad.set(id, 0);
      dirtyAssignedCount.set(id, 0);
      restantCountByHk.set(id, 0);
    }
  }
  for (const item of items) {
    const hk = assigned.get(item.key);
    if (!hk) continue;
    if (item.workType === 'PUBLIC') {
      publicLoad.set(hk, (publicLoad.get(hk) ?? 0) + 1);
    } else {
      roomLoad.set(hk, (roomLoad.get(hk) ?? 0) + 1);
      if (item.workType === 'DIRTY') {
        dirtyAssignedCount.set(hk, (dirtyAssignedCount.get(hk) ?? 0) + 1);
      } else if (item.workType === 'RESTANT') {
        restantCountByHk.set(hk, (restantCountByHk.get(hk) ?? 0) + 1);
      }
    }
  }

  // --- Restant → split across preferred assignees (or auto-pick one) ---
  const restants = items.filter((i) => i.workType === 'RESTANT' && !assigned.has(i.key));
  if (restants.length > 0) {
    let pool = preferredRestantIds;
    if (pool.length === 0) {
      const nonLate = cleaners.filter((c) => !c.isLateShift);
      const autoPool = nonLate.length > 0 ? nonLate : cleaners;
      if (autoPool.length > 0) {
        let best = autoPool[0]!;
        for (const c of autoPool) {
          if ((roomLoad.get(c.housekeeperId) ?? 0) < (roomLoad.get(best.housekeeperId) ?? 0)) {
            best = c;
          }
        }
        pool = [best.housekeeperId];
      }
    }
    if (pool.length > 0) {
      // Contiguous chunks by floor/room order so each person gets a cluster
      const sortedRestants = [...restants].sort(compareDirtyRooms);
      const targets = allocateTargets(
        pool,
        new Map(pool.map((id) => [id, 1])),
        sortedRestants.length,
      );
      let cursor = 0;
      const order = [...pool].sort((a, b) => a.localeCompare(b));
      for (const hk of order) {
        let need = targets.get(hk) ?? 0;
        while (need > 0 && cursor < sortedRestants.length) {
          const item = sortedRestants[cursor]!;
          cursor += 1;
          assigned.set(item.key, hk);
          roomLoad.set(hk, (roomLoad.get(hk) ?? 0) + 1);
          restantCountByHk.set(hk, (restantCountByHk.get(hk) ?? 0) + 1);
          need -= 1;
        }
      }
      while (cursor < sortedRestants.length) {
        const hk = order[cursor % order.length]!;
        const item = sortedRestants[cursor]!;
        cursor += 1;
        assigned.set(item.key, hk);
        roomLoad.set(hk, (roomLoad.get(hk) ?? 0) + 1);
        restantCountByHk.set(hk, (restantCountByHk.get(hk) ?? 0) + 1);
      }
    }
  }

  const totalRestantAssigned = [...restantCountByHk.values()].reduce((s, n) => s + n, 0);

  // --- Dirty rooms: contiguous blocks by floor/room order ---
  const dirty = items.filter((i) => i.workType === 'DIRTY' && !assigned.has(i.key));
  if (dirty.length > 0 && cleaners.length > 0) {
    const dirtyWeights = new Map<string, number>();
    for (const c of cleaners) {
      let w = c.roomWeight;
      const rc = restantCountByHk.get(c.housekeeperId) ?? 0;
      if (rc > 0 && totalRestantAssigned > 0) {
        // Full restant share → RESTANT_DIRTY_FACTOR; half share → midway to 1.
        const share = rc / totalRestantAssigned;
        w *= 1 + share * (RESTANT_DIRTY_FACTOR - 1);
      }
      dirtyWeights.set(c.housekeeperId, w);
    }

    const cleanerIds = cleaners.map((c) => c.housekeeperId);
    const totalDirtyIncludingPinned =
      dirty.length + cleanerIds.reduce((s, id) => s + (dirtyAssignedCount.get(id) ?? 0), 0);

    let targets: Map<string, number>;
    if (options?.dirtyRoomTargets && options.dirtyRoomTargets.size > 0) {
      targets = new Map<string, number>();
      for (const id of cleanerIds) {
        targets.set(id, Math.max(0, Math.floor(options.dirtyRoomTargets.get(id) ?? 0)));
      }
      // Ensure every cleaner id from targets is considered even if not in cleaners (skip)
      let sum = cleanerIds.reduce((s, id) => s + (targets.get(id) ?? 0), 0);
      if (sum !== totalDirtyIncludingPinned && cleanerIds.length > 0) {
        // Normalize so targets sum to total dirty rooms
        if (sum <= 0) {
          targets = allocateTargets(cleanerIds, dirtyWeights, totalDirtyIncludingPinned);
        } else {
          const scaled = new Map<string, number>();
          let allocated = 0;
          for (const id of cleanerIds) {
            const t = Math.floor(((targets.get(id) ?? 0) * totalDirtyIncludingPinned) / sum);
            scaled.set(id, t);
            allocated += t;
          }
          let rem = totalDirtyIncludingPinned - allocated;
          const ordered = [...cleanerIds].sort((a, b) => a.localeCompare(b));
          for (const id of ordered) {
            if (rem <= 0) break;
            scaled.set(id, (scaled.get(id) ?? 0) + 1);
            rem -= 1;
          }
          targets = scaled;
        }
      }
    } else {
      targets = allocateTargets(cleanerIds, dirtyWeights, totalDirtyIncludingPinned);
    }

    // Carve only unassigned rooms; reduce each cleaner's remaining by pinned dirty already held
    const remaining = new Map<string, number>();
    for (const id of cleanerIds) {
      remaining.set(id, Math.max(0, (targets.get(id) ?? 0) - (dirtyAssignedCount.get(id) ?? 0)));
    }
    let sum = [...remaining.values()].reduce((s, n) => s + n, 0);
    if (sum < dirty.length) {
      let extra = dirty.length - sum;
      const ordered = [...cleanerIds].sort((a, b) => {
        const dw = (dirtyWeights.get(b) ?? 0) - (dirtyWeights.get(a) ?? 0);
        if (dw !== 0) return dw;
        return a.localeCompare(b);
      });
      for (const id of ordered) {
        if (extra <= 0) break;
        remaining.set(id, (remaining.get(id) ?? 0) + 1);
        extra -= 1;
      }
    } else if (sum > dirty.length) {
      let excess = sum - dirty.length;
      const ordered = [...cleanerIds].sort((a, b) => {
        const dw = (dirtyWeights.get(a) ?? 0) - (dirtyWeights.get(b) ?? 0);
        if (dw !== 0) return dw;
        return b.localeCompare(a);
      });
      for (const id of ordered) {
        if (excess <= 0) break;
        const cur = remaining.get(id) ?? 0;
        const take = Math.min(cur, excess);
        remaining.set(id, cur - take);
        excess -= take;
      }
    }

    const sortedDirty = [...dirty].sort(compareDirtyRooms);
    const carveOrder = [...cleanerIds].sort((a, b) => {
      const dt = (remaining.get(b) ?? 0) - (remaining.get(a) ?? 0);
      if (dt !== 0) return dt;
      const dw = (dirtyWeights.get(b) ?? 0) - (dirtyWeights.get(a) ?? 0);
      if (dw !== 0) return dw;
      return a.localeCompare(b);
    });

    let cursor = 0;
    for (const hkId of carveOrder) {
      let need = remaining.get(hkId) ?? 0;
      while (need > 0 && cursor < sortedDirty.length) {
        const item = sortedDirty[cursor]!;
        cursor += 1;
        assigned.set(item.key, hkId);
        roomLoad.set(hkId, (roomLoad.get(hkId) ?? 0) + 1);
        dirtyAssignedCount.set(hkId, (dirtyAssignedCount.get(hkId) ?? 0) + 1);
        need -= 1;
      }
      remaining.set(hkId, need);
    }
    while (cursor < sortedDirty.length) {
      const fallback = carveOrder[carveOrder.length - 1] ?? cleanerIds[0]!;
      const item = sortedDirty[cursor]!;
      cursor += 1;
      assigned.set(item.key, fallback);
      roomLoad.set(fallback, (roomLoad.get(fallback) ?? 0) + 1);
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

export { LATE_ROOM_WEIGHT, RESTANT_DIRTY_FACTOR };

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
