import { formatHotelDateOnly } from '@housekeeping/shared';
import { normalizeEmmaRoomNumber } from '../emma/emma-room-status-sync';

export type GuestStaySnapshotRow = {
  roomId: string | null;
  arrivalDate: Date;
  departureDate: Date;
  checkOut: boolean;
};

/** Whether a reservation snapshot belongs to the given local room number. */
export function matchesGuestStayForRoom(
  snapshotRoomId: string | null | undefined,
  targetRoomNumber: string,
): boolean {
  const raw = snapshotRoomId?.trim();
  if (!raw) return false;
  return normalizeEmmaRoomNumber(raw) === normalizeEmmaRoomNumber(targetRoomNumber);
}

/**
 * Whether a stay overlaps an optional inclusive date range (ISO YYYY-MM-DD).
 * Empty range matches all stays.
 */
export function matchesGuestStayDateRange(
  arrivalDate: Date,
  departureDate: Date,
  from?: string,
  to?: string,
): boolean {
  const arrival = formatHotelDateOnly(arrivalDate);
  const departure = formatHotelDateOnly(departureDate);
  if (from && departure < from) return false;
  if (to && arrival > to) return false;
  return true;
}

export type GuestStayPresence = 'in_house' | 'departed';

/** Classify guest presence relative to hotel today. */
export function guestStayPresence(
  departureDate: Date,
  checkOut: boolean,
  today: string,
): GuestStayPresence {
  const departure = formatHotelDateOnly(departureDate);
  if (checkOut) return 'departed';
  if (departure < today) return 'departed';
  return 'in_house';
}
