import { formatHotelDateOnly } from '@housekeeping/shared';

export type SnapshotDepartureRow = {
  reservationId: string;
  roomId: string | null;
  departureDate: Date;
  checkIn: boolean;
  checkOut: boolean;
};

/** Whether a reservation snapshot counts as a departure on the requested date. */
export function matchesDepartureDateQuery(
  row: SnapshotDepartureRow,
  date: string,
  today: string,
): boolean {
  if (!row.checkIn) return false;
  if (!row.roomId?.trim()) return false;
  if (formatHotelDateOnly(row.departureDate) !== date) return false;
  if (!row.checkOut) return true;
  return date === today;
}

export function buildEmmaCountWarnings(
  mappedCount: number,
  unmappedCount: number,
  emmaExpectedCount: number | null,
  date: string,
  today: string,
): string[] {
  if (date !== today || emmaExpectedCount == null) return [];
  const total = mappedCount + unmappedCount;
  if (total === emmaExpectedCount) return [];
  return [
    `Expected ${emmaExpectedCount} departures from EMMA but found ${total} in reservation snapshots (${mappedCount} mapped, ${unmappedCount} unmapped).`,
  ];
}
