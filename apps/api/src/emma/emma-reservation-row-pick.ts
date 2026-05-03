import { parseStayDateToUtcNoon } from './emma-reservation-search';

/** Default weight for |nights_row − nights_ai| in the composite score. */
export const EMMA_PICK_NIGHTS_WEIGHT_DEFAULT = 7;

export type EmmaReservationGridRow = {
  /** Arrival as shown in the EMMA grid (e.g. `15.04.2026` or `15.04.2026, 14:00`). */
  arrival: string | null | undefined;
  /** Departure as shown in the EMMA grid. */
  departure: string | null | undefined;
  guestName?: string | null;
  /** PMS reservation id as shown in the grid, if available. */
  reservationId?: string | null;
};

export type PuzzelStayContextForPick = {
  checkInDate: string | null | undefined;
  checkOutDate: string | null | undefined;
  guestName?: string | null;
  reservationNumber?: string | null;
};

export type PickClosestEmmaRowResult<T extends EmmaReservationGridRow> = {
  row: T;
  index: number;
  /** Lower is a better date match; `Infinity` when row dates could not be scored. */
  score: number;
};

/** Milliseconds per UTC calendar day at noon↔noon steps. */
const MS_PER_DAY = 86_400_000;

function utcCalendarDayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

function absUtcCalendarDayDiff(a: Date, b: Date): number {
  return Math.abs(utcCalendarDayDiff(a, b));
}

function nightsBetween(arrivalUtcNoon: Date, departureUtcNoon: Date): number {
  return Math.max(0, utcCalendarDayDiff(departureUtcNoon, arrivalUtcNoon));
}

/**
 * Parse a single date cell from the EMMA results grid (German day first; strips
 * trailing time after comma/space if present).
 */
export function parseEmmaGridDateCell(raw: string | null | undefined): Date | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const head = /^(\d{1,2}\.\d{1,2}\.\d{4})/.exec(s);
  const candidate = head ? head[1] : s.split(',', 1)[0].trim();
  return parseStayDateToUtcNoon(candidate);
}

function normalizeName(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ');
}

/** Higher is better (used only as tie-breaker after `score`). */
function guestNameTieRank(ctx: string | null | undefined, row: string | null | undefined): number {
  const a = normalizeName(ctx);
  const b = normalizeName(row);
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (b.includes(a) || a.includes(b)) return 2;
  const aParts = a.split(',').map((p) => p.trim());
  const bParts = b.split(',').map((p) => p.trim());
  if (aParts.length >= 2 && bParts.length >= 2) {
    if (aParts[0] === bParts[0] && (aParts[1] === bParts[1] || bParts[1].startsWith(aParts[1])))
      return 2;
  }
  return 0;
}

function reservationIdTieRank(
  ctxNum: string | null | undefined,
  rowId: string | null | undefined,
): number {
  if (ctxNum == null || rowId == null) return 0;
  const a = String(ctxNum).trim();
  const b = String(rowId).trim();
  if (!a || !b) return 0;
  if (a === b) return 2;
  if (b.includes(a) || a.includes(b)) return 1;
  return 0;
}

function resolveAiStayBounds(ctx: PuzzelStayContextForPick): {
  checkIn: Date;
  checkOut: Date;
} | null {
  let ci = parseStayDateToUtcNoon(ctx.checkInDate);
  let co = parseStayDateToUtcNoon(ctx.checkOutDate);

  if (!ci && co) {
    const x = new Date(co.getTime());
    x.setUTCDate(x.getUTCDate() - 1);
    ci = x;
  }
  if (ci && !co) {
    const x = new Date(ci.getTime());
    x.setUTCDate(x.getUTCDate() + 1);
    co = x;
  }

  if (!ci || !co) return null;
  return { checkIn: ci, checkOut: co };
}

type Candidate<T extends EmmaReservationGridRow> = PickClosestEmmaRowResult<T> & {
  guestRank: number;
  resRank: number;
};

/**
 * When EMMA Search Reservations returns multiple rows, pick the one whose stay
 * dates are closest to the Puzzel / AI `checkInDate` and `checkOutDate`.
 *
 * Score (minimize): `|Δarrival| + |Δdeparture| + nightsWeight × |Δnights|`.
 * Unparseable row dates → `Infinity`. Missing AI dates → all finite scores are 0;
 * tie-break with guest name, then reservation number, then row index.
 */
export function pickClosestEmmaReservationRow<T extends EmmaReservationGridRow>(
  rows: readonly T[],
  ctx: PuzzelStayContextForPick,
  opts?: { nightsWeight?: number },
): PickClosestEmmaRowResult<T> | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) {
    return { row: rows[0], index: 0, score: 0 };
  }

  const nightsW = opts?.nightsWeight ?? EMMA_PICK_NIGHTS_WEIGHT_DEFAULT;
  const ai = resolveAiStayBounds(ctx);

  const candidates: Candidate<T>[] = rows.map((row, index) => {
    const ra = parseEmmaGridDateCell(row.arrival);
    const rd = parseEmmaGridDateCell(row.departure);
    const guestRank = guestNameTieRank(ctx.guestName, row.guestName);
    const resRank = reservationIdTieRank(ctx.reservationNumber, row.reservationId);

    if (!ra || !rd) {
      return { row, index, score: Number.POSITIVE_INFINITY, guestRank, resRank };
    }

    if (!ai) {
      return { row, index, score: 0, guestRank, resRank };
    }

    const dArr = absUtcCalendarDayDiff(ra, ai.checkIn);
    const dDep = absUtcCalendarDayDiff(rd, ai.checkOut);
    const nightsRow = nightsBetween(ra, rd);
    const nightsAi = nightsBetween(ai.checkIn, ai.checkOut);
    const score = dArr + dDep + nightsW * Math.abs(nightsRow - nightsAi);

    return { row, index, score, guestRank, resRank };
  });

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (b.guestRank !== a.guestRank) return b.guestRank - a.guestRank;
    if (b.resRank !== a.resRank) return b.resRank - a.resRank;
    return a.index - b.index;
  });

  const best = candidates[0];
  return { row: best.row, index: best.index, score: best.score };
}
