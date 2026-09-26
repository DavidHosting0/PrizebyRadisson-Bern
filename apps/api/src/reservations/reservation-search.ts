import { Prisma } from '@prisma/client';

/** Unfiltered reservations list and name-search result cap. */
export const RESERVATION_LIST_LIMIT = 500;

/** Rows decrypted per page while scanning stored reservations for a search. */
export const RESERVATION_SEARCH_BATCH = 400;

export type ReservationSearchCursor = {
  arrivalDate: Date;
  id: string;
};

export type ReservationSearchFields = {
  mainGuestName: string | null;
  reservationId: string;
  roomId: string | null;
  groupName: string | null;
  roomType: string | null;
  vipDesc: string | null;
  tier: string | null;
};

export function clampReservationSearchLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return RESERVATION_LIST_LIMIT;
  return Math.min(RESERVATION_LIST_LIMIT, Math.max(1, Math.floor(raw)));
}

/** Keyset page: newest arrival first, then id, strictly after the previous page. */
export function reservationSearchPageWhere(
  hotelId: string,
  cursor: ReservationSearchCursor | null,
): Prisma.ReservationSnapshotWhereInput {
  if (!cursor) return { hotelId };
  return {
    hotelId,
    OR: [
      { arrivalDate: { lt: cursor.arrivalDate } },
      { AND: [{ arrivalDate: cursor.arrivalDate }, { id: { lt: cursor.id } }] },
    ],
  };
}

export function reservationListItemMatchesQuery(row: ReservationSearchFields, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    row.mainGuestName?.toLowerCase().includes(needle) === true ||
    row.reservationId.toLowerCase().includes(needle) ||
    row.roomId?.toLowerCase().includes(needle) === true ||
    row.groupName?.toLowerCase().includes(needle) === true ||
    row.roomType?.toLowerCase().includes(needle) === true ||
    row.vipDesc?.toLowerCase().includes(needle) === true ||
    row.tier?.toLowerCase().includes(needle) === true
  );
}

/**
 * Walk stored reservations from newest arrival backward until `limit` matches
 * or the archive is exhausted. A short page ends the scan.
 */
export async function collectPagedMatches<T>(opts: {
  batchSize: number;
  limit: number;
  fetchPage: (cursor: ReservationSearchCursor | null) => Promise<T[]>;
  matches: (row: T) => boolean;
  cursorOf: (row: T) => ReservationSearchCursor;
}): Promise<T[]> {
  const found: T[] = [];
  let cursor: ReservationSearchCursor | null = null;

  for (;;) {
    const page = await opts.fetchPage(cursor);
    if (page.length === 0) return found;

    for (const row of page) {
      if (opts.matches(row)) {
        found.push(row);
        if (found.length >= opts.limit) return found;
      }
    }

    if (page.length < opts.batchSize) return found;
    cursor = opts.cursorOf(page[page.length - 1]!);
  }
}
