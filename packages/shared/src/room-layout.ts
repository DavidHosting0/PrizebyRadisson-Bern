/**
 * Physical hotel layout: map room numbers to floors.
 * Rooms whose number ends in …13 do not exist (13, 113, 213, …).
 */

const UPPER_FLOOR_RANGES: ReadonlyArray<readonly [number, number]> = [
  [101, 124],
  [201, 224],
  [301, 324],
  [401, 424],
  [501, 524],
  [601, 624],
  [701, 718],
];

export function isExcludedRoom13(roomNumber: string): boolean {
  const n = parseInt(roomNumber, 10);
  if (!Number.isFinite(n)) return true;
  return n % 100 === 13;
}

export function floorFromRoomNumber(roomNumber: string): number | null {
  if (isExcludedRoom13(roomNumber)) return null;
  const n = parseInt(roomNumber, 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 1 && n <= 17) return -1;
  if (n >= 18 && n <= 28) return 0;
  for (let f = 1; f <= UPPER_FLOOR_RANGES.length; f++) {
    const [lo, hi] = UPPER_FLOOR_RANGES[f - 1];
    if (n >= lo && n <= hi) return f;
  }
  return null;
}

export function allHotelRoomNumbers(): string[] {
  const out: string[] = [];
  for (let n = 1; n <= 17; n++) {
    if (n % 100 === 13) continue;
    out.push(String(n));
  }
  for (let n = 18; n <= 28; n++) {
    out.push(String(n));
  }
  for (const [lo, hi] of UPPER_FLOOR_RANGES) {
    for (let n = lo; n <= hi; n++) {
      if (n % 100 === 13) continue;
      out.push(String(n));
    }
  }
  return out;
}

/** Numeric order for room labels (1, 2, … 10, … 101, …). */
export function compareRoomNumbers(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const okA = Number.isFinite(na);
  const okB = Number.isFinite(nb);
  if (okA && okB) return na - nb;
  if (okA && !okB) return -1;
  if (!okA && okB) return 1;
  return a.localeCompare(b);
}

export function formatFloorLabel(floor: number | null | undefined): string {
  if (floor == null) return '—';
  if (floor === -1) return 'Basement';
  return `Floor ${floor}`;
}

/** Column count for floor-plan CSS grid from number of rooms on that floor. */
export function floorPlanGridCols(roomCount: number): number {
  if (roomCount <= 0) return 1;
  if (roomCount <= 8) return 4;
  if (roomCount <= 16) return 6;
  if (roomCount <= 24) return 8;
  return 10;
}
