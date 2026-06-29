import { normalizeEmmaRoomNumber } from '../emma/emma-room-status-sync';

export type GuestStaySyncInput = {
  roomId: string | null;
  checkIn: boolean;
  checkOut: boolean;
  inCheckInDone: boolean;
};

export type OpenGuestStayRef = {
  roomNumber: string;
  checkedOut: boolean;
};

export type GuestStaySyncAction =
  | { kind: 'skip' }
  | { kind: 'checkout' }
  | { kind: 'create'; roomNumber: string }
  | { kind: 'update'; roomNumber: string }
  | { kind: 'room_change'; previousRoomNumber: string; roomNumber: string };

/** Decide how a sync row should mutate the guest-stay archive. */
export function decideGuestStaySyncAction(
  input: GuestStaySyncInput,
  openStay: OpenGuestStayRef | null,
): GuestStaySyncAction {
  const roomNumber = input.roomId?.trim()
    ? normalizeEmmaRoomNumber(input.roomId)
    : null;

  if (input.checkOut) {
    return { kind: 'checkout' };
  }

  if (!roomNumber) {
    return { kind: 'skip' };
  }

  const shouldTrack = input.checkIn || input.inCheckInDone;
  if (!shouldTrack) {
    return { kind: 'skip' };
  }

  if (!openStay || openStay.checkedOut) {
    return { kind: 'create', roomNumber };
  }

  const previousRoomNumber = normalizeEmmaRoomNumber(openStay.roomNumber);
  if (previousRoomNumber !== roomNumber) {
    return { kind: 'room_change', previousRoomNumber, roomNumber };
  }

  return { kind: 'update', roomNumber };
}

/** Whether a reservation snapshot qualifies for backfill into RoomGuestStay. */
export function shouldBackfillGuestStay(snapshot: {
  roomId: string | null;
  checkIn: boolean;
  inCheckInDone: boolean;
  checkOut: boolean;
}): boolean {
  if (!snapshot.roomId?.trim()) return false;
  return snapshot.checkIn || snapshot.inCheckInDone || snapshot.checkOut;
}
