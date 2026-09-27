import { floorFromRoomNumber } from './room-layout';
import { isEastAsianName } from './east-asian-name';

export { isEastAsianName };

export const CORNER_ROOM_NUMBERS = [
  '29',
  '30',
  '109',
  '110',
  '209',
  '210',
  '309',
  '310',
  '409',
  '410',
  '509',
  '510',
  '609',
  '610',
] as const;

export const WHEELCHAIR_ROOM_NUMBERS = ['21', '101', '201', '301', '401', '501', '601', '701'] as const;

export type RoomCategory = 'standard' | 'corner' | 'view';

export type RoomSuggestMode = 'plan' | 'now';

export type RoomSuggestReason =
  | 'vip'
  | 'premium'
  | 'repeat'
  | 'one_night'
  | 'long_stay'
  | 'three_pax'
  | 'no_basement'
  | 'not_ready'
  | 'category_not_ready'
  | 'overbook_view'
  | 'overbook_corner'
  | 'overbook_standard'
  | 'wheelchair';

export type RoomSuggestGuest = {
  reservationId: string;
  guestName: string | null;
  roomType: string | null;
  nights: number | null;
  numPax: number | null;
  vipDesc: string | null;
  tier: string | null;
  country: string | null;
  previousStays: number;
  assignedRoom: string | null;
};

export type RoomSuggestRoomStatus = 'OUT_OF_ORDER' | 'DIRTY' | 'IN_PROGRESS' | 'CLEAN' | 'INSPECTED';

export type RoomSuggestRoom = {
  roomNumber: string;
  status: RoomSuggestRoomStatus;
  occupiedNow?: boolean;
  departsToday?: boolean;
};

export type RoomSuggestInput = {
  mode: RoomSuggestMode;
  reservationId: string;
  guests: RoomSuggestGuest[];
  rooms: RoomSuggestRoom[];
  /** Room numbers that overlap this guest's stay (same-day turnover is not a block). */
  blockedRoomsByGuest?: Record<string, string[]>;
  /** Accepted in the extension before EMMA sync: reservationId → room number. */
  heldRooms?: Record<string, string>;
};

export type RoomSuggestion = {
  reservationId: string;
  roomNumber: string;
  floor: number | null;
  category: RoomCategory;
  bookedCategory: RoomCategory;
  readyNow: boolean;
  /** Housekeeping state of the suggested room. Anreise jetzt is for everything except inspected. */
  roomStatus?: RoomSuggestRoomStatus;
  reasons: RoomSuggestReason[];
};

const CORNER = new Set<string>(CORNER_ROOM_NUMBERS);
const WHEELCHAIR = new Set<string>(WHEELCHAIR_ROOM_NUMBERS);

const VIEW_FLOOR_ROOMS: string[] = [];
for (let n = 702; n <= 718; n++) VIEW_FLOOR_ROOMS.push(String(n));
const VIEW = new Set<string>(VIEW_FLOOR_ROOMS);

export function normalizeGuestName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** EMMA placeholder until the booking has a real guest name. */
const PLACEHOLDER_GUEST_NAMES = new Set(['web guest']);

export function isPlaceholderGuestName(name: string | null | undefined): boolean {
  if (!name) return false;
  return PLACEHOLDER_GUEST_NAMES.has(normalizeGuestName(name));
}

/** Name key for repeat-guest matching. Placeholders match nobody. */
export function repeatGuestNameKey(name: string | null | undefined): string {
  if (!name || isPlaceholderGuestName(name)) return '';
  return normalizeGuestName(name);
}

export function bookedRoomCategory(roomType: string | null | undefined): RoomCategory {
  const compact = (roomType ?? '').replace(/-/g, '').toUpperCase();
  if (compact.includes('PCMFCR')) return 'corner';
  if (compact.includes('PCMFVP')) return 'view';
  return 'standard';
}

export function physicalRoomCategory(roomNumber: string): RoomCategory {
  const n = canonicalRoom(roomNumber);
  if (CORNER.has(n)) return 'corner';
  if (VIEW.has(n)) return 'view';
  return 'standard';
}

export function isWheelchairRoom(roomNumber: string): boolean {
  return WHEELCHAIR.has(canonicalRoom(roomNumber));
}

/** Larger rooms for 3 guests: suffix 08/12 on floors 0–7. Basement 8 and 12 are not larger. */
export function isThreePersonRoom(roomNumber: string): boolean {
  const n = canonicalRoom(roomNumber);
  const floor = floorFromRoomNumber(n);
  if (floor == null || floor < 0 || floor > 7) return false;
  const num = parseInt(n, 10);
  if (!Number.isFinite(num)) return false;
  const suffix = num % 100;
  return suffix === 8 || suffix === 12;
}

export function isChinaJapanOrKorea(value: string | null | undefined): boolean {
  if (!value) return false;
  const n = value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (
    [
      'CN', 'CHN', 'PRC', 'JP', 'JPN', 'KR', 'KOR', 'TW', 'TWN', 'HK', 'HKG', 'MO', 'MAC',
      'CHINA', 'JAPAN', 'KOREA', 'SOUTH KOREA', 'NORTH KOREA', 'SÜDKOREA', 'TAIWAN',
      'HONG KONG', 'HONGKONG', 'MACAU', 'MACAO', 'CHINESE', 'JAPANESE', 'KOREAN',
    ].includes(n)
  ) {
    return true;
  }
  return (
    n.includes('KOREA') ||
    n.includes('SÜDKOREA') ||
    n.includes('HONG KONG') ||
    n.includes('HONGKONG') ||
    n.includes('TAIWAN') ||
    n.includes('CHINA') ||
    n.includes('JAPAN')
  );
}

export function guestAvoidsBasement(guest: Pick<RoomSuggestGuest, 'country' | 'guestName'>): boolean {
  return isChinaJapanOrKorea(guest.country) || isEastAsianName(guest.guestName);
}

export function guestIsVip(guest: Pick<RoomSuggestGuest, 'vipDesc' | 'tier'>): boolean {
  return /vip/i.test(guest.vipDesc ?? '') || /vip/i.test(guest.tier ?? '');
}

export function guestIsPremium(guest: Pick<RoomSuggestGuest, 'vipDesc' | 'tier' | 'roomType'>): boolean {
  return (
    /premium/i.test(guest.vipDesc ?? '') ||
    /premium/i.test(guest.tier ?? '') ||
    /premium/i.test(guest.roomType ?? '')
  );
}

export function guestIsRepeat(guest: Pick<RoomSuggestGuest, 'previousStays'>): boolean {
  return guest.previousStays >= 2;
}

function canonicalRoom(roomNumber: string): string {
  const n = parseInt(roomNumber, 10);
  if (!Number.isFinite(n)) return roomNumber.trim();
  return String(n);
}

type Candidate = {
  roomNumber: string;
  floor: number;
  status: RoomSuggestRoomStatus;
  occupiedNow: boolean;
  departsToday: boolean;
  readyNow: boolean;
  category: RoomCategory;
};

function decorate(room: RoomSuggestRoom): Candidate | null {
  const roomNumber = canonicalRoom(room.roomNumber);
  const floor = floorFromRoomNumber(roomNumber);
  if (floor == null) return null;
  const occupiedNow = room.occupiedNow === true;
  const departsToday = room.departsToday === true;
  const readyNow =
    room.status !== 'OUT_OF_ORDER' &&
    !occupiedNow &&
    (room.status === 'CLEAN' || room.status === 'INSPECTED');
  return {
    roomNumber,
    floor,
    status: room.status,
    occupiedNow,
    departsToday,
    readyNow,
    category: physicalRoomCategory(roomNumber),
  };
}

function blockedSet(input: RoomSuggestInput, reservationId: string): Set<string> {
  const list = input.blockedRoomsByGuest?.[reservationId] ?? [];
  return new Set(list.map(canonicalRoom));
}

function stayAvailable(guestId: string, room: Candidate, input: RoomSuggestInput, taken: Set<string>): boolean {
  if (taken.has(room.roomNumber)) return false;
  if (room.status === 'OUT_OF_ORDER') return false;
  if (blockedSet(input, guestId).has(room.roomNumber)) return false;
  if (room.occupiedNow && !room.departsToday) return false;
  return true;
}

function usable(guestId: string, room: Candidate, input: RoomSuggestInput, taken: Set<string>): boolean {
  if (!stayAvailable(guestId, room, input, taken)) return false;
  if (input.mode === 'now') return room.readyNow;
  return true;
}

function wheelchairEligible(guest: RoomSuggestGuest): boolean {
  return (guest.numPax ?? 0) === 1 && (guest.nights ?? 1) <= 3;
}

function excludeBasement(guest: RoomSuggestGuest): boolean {
  if (guestAvoidsBasement(guest)) return true;
  const nights = guest.nights ?? 1;
  if (nights !== 1) return true;
  if (!guestIsVip(guest) && (guestIsPremium(guest) || guestIsRepeat(guest))) return true;
  return false;
}

function applyGuestFilters(guest: RoomSuggestGuest, rooms: Candidate[]): Candidate[] {
  let next = rooms;
  if (!wheelchairEligible(guest)) {
    next = next.filter((r) => !isWheelchairRoom(r.roomNumber));
  }
  if (excludeBasement(guest)) {
    next = next.filter((r) => r.floor !== -1);
  }
  if ((guest.numPax ?? 0) === 3) {
    const larger = next.filter((r) => isThreePersonRoom(r.roomNumber));
    if (larger.length) next = larger;
  }
  if (wheelchairEligible(guest)) {
    const normal = next.filter((r) => !isWheelchairRoom(r.roomNumber));
    if (normal.length) next = normal;
  }
  return next;
}

function floorPreference(guest: RoomSuggestGuest, category: RoomCategory): number[] {
  const vip = guestIsVip(guest);
  const mid = !vip && (guestIsPremium(guest) || guestIsRepeat(guest));
  const nights = guest.nights ?? 1;
  if (category === 'view') return [7];
  if (vip) {
    return category === 'corner' ? [6, 5, 4, 3, 2, 1, 0] : [6, 5, 4, 3, 2, 1, 0, -1];
  }
  if (mid) {
    return category === 'corner' ? [3, 4, 2, 5, 1, 6, 0] : [3, 4, 2, 5, 1, 6, 0];
  }
  if (nights <= 1) {
    if (category === 'corner') return [0, 1, 2, 3, 4, 5, 6];
    const low: number[] = [];
    if (!excludeBasement(guest)) low.push(-1);
    low.push(0, 1, 2, 3, 4, 5, 6);
    return low;
  }
  return category === 'corner' ? [6, 5, 4, 3, 2, 1, 0] : [6, 5, 4, 3, 2, 1, 0];
}

function viewNumberScore(guest: RoomSuggestGuest, roomNumber: string): number {
  const n = parseInt(roomNumber, 10);
  const vip = guestIsVip(guest);
  const mid = !vip && (guestIsPremium(guest) || guestIsRepeat(guest));
  const nights = guest.nights ?? 1;
  if (vip || (!mid && nights >= 2)) return -n;
  if (mid) {
    const preferred = n >= 708 && n <= 712 ? 0 : 1;
    return preferred * 1000 + Math.abs(n - 710);
  }
  return n;
}

function pickFromPool(guest: RoomSuggestGuest, pool: Candidate[], taken: Set<string>): Candidate | null {
  const filtered = applyGuestFilters(guest, pool).filter((room) => !taken.has(room.roomNumber));
  if (!filtered.length) return null;
  const ranked = [...filtered].sort((a, b) => {
    const orderA = floorPreference(guest, a.category);
    const orderB = floorPreference(guest, b.category);
    const sa = orderA.indexOf(a.floor);
    const sb = orderB.indexOf(b.floor);
    const fa = sa === -1 ? 99 : sa;
    const fb = sb === -1 ? 99 : sb;
    if (fa !== fb) return fa - fb;
    if (a.readyNow !== b.readyNow) return a.readyNow ? -1 : 1;
    return roomNumberScore(guest, a) - roomNumberScore(guest, b);
  });
  return ranked[0] ?? null;
}

function roomNumberScore(guest: RoomSuggestGuest, room: Candidate): number {
  if (room.category === 'view') return viewNumberScore(guest, room.roomNumber);
  const vip = guestIsVip(guest);
  const nights = guest.nights ?? 1;
  const mid = !vip && (guestIsPremium(guest) || guestIsRepeat(guest));
  const n = parseInt(room.roomNumber, 10);
  if (vip || (!mid && nights >= 2)) return -n;
  return n;
}

function claimTier(guest: RoomSuggestGuest): number {
  if (guestIsVip(guest) || guestIsRepeat(guest)) return 0;
  if (guestIsPremium(guest)) return 1;
  return 2;
}

function profileReasons(guest: RoomSuggestGuest): RoomSuggestReason[] {
  const reasons: RoomSuggestReason[] = [];
  if (guestIsVip(guest)) reasons.push('vip');
  else if (guestIsPremium(guest)) reasons.push('premium');
  else if (guestIsRepeat(guest)) reasons.push('repeat');
  else if ((guest.nights ?? 1) <= 1) reasons.push('one_night');
  else reasons.push('long_stay');
  if (guestIsRepeat(guest) && guestIsVip(guest)) reasons.push('repeat');
  if (guestIsRepeat(guest) && guestIsPremium(guest) && !guestIsVip(guest)) reasons.push('repeat');
  if (guestAvoidsBasement(guest)) reasons.push('no_basement');
  return reasons;
}

function spare(
  category: RoomCategory,
  guest: RoomSuggestGuest,
  guests: RoomSuggestGuest[],
  placed: Set<string>,
  rooms: Candidate[],
  input: RoomSuggestInput,
  taken: Set<string>,
): boolean {
  const demand = guests.filter(
    (other) =>
      other.reservationId !== guest.reservationId &&
      !placed.has(other.reservationId) &&
      bookedRoomCategory(other.roomType) === category,
  );
  const supply = rooms.filter(
    (room) =>
      room.category === category &&
      (demand.length === 0
        ? usable(guest.reservationId, room, input, taken)
        : demand.some((other) => usable(other.reservationId, room, input, taken))),
  );
  if (demand.length === 0) return supply.length > 0;
  return supply.length > demand.length;
}

function effectiveAssigned(guest: RoomSuggestGuest, input: RoomSuggestInput): string | null {
  if (guest.assignedRoom) return canonicalRoom(guest.assignedRoom);
  const held = input.heldRooms?.[guest.reservationId];
  return held ? canonicalRoom(held) : null;
}

function poolForCategory(
  category: RoomCategory,
  guest: RoomSuggestGuest,
  rooms: Candidate[],
  input: RoomSuggestInput,
  taken: Set<string>,
  readyOnly: boolean,
): Candidate[] {
  return rooms.filter(
    (room) =>
      room.category === category &&
      stayAvailable(guest.reservationId, room, input, taken) &&
      (!readyOnly || room.readyNow),
  );
}

function chooseForGuest(
  guest: RoomSuggestGuest,
  guests: RoomSuggestGuest[],
  rooms: Candidate[],
  input: RoomSuggestInput,
  placed: Set<string>,
  taken: Set<string>,
): { room: Candidate; reasons: RoomSuggestReason[] } | null {
  const booked = bookedRoomCategory(guest.roomType);
  const inBooked = poolForCategory(booked, guest, rooms, input, taken, false);
  const readyBooked = inBooked.filter((room) => room.readyNow);
  const reasons = profileReasons(guest);

  let pool: Candidate[] = [];
  if (input.mode === 'now' && inBooked.length > 0 && readyBooked.length === 0) {
    reasons.push('category_not_ready');
    pool = poolForCategory('standard', guest, rooms, input, taken, true);
  } else if ((input.mode === 'now' ? readyBooked : inBooked).length === 0) {
    if (booked === 'view') reasons.push('overbook_view');
    else if (booked === 'corner') reasons.push('overbook_corner');
    else reasons.push('overbook_standard');

    const readyOnly = input.mode === 'now';
    if (booked === 'view' && spare('corner', guest, guests, placed, rooms, input, taken)) {
      pool = poolForCategory('corner', guest, rooms, input, taken, readyOnly);
    } else if (booked === 'corner' && spare('view', guest, guests, placed, rooms, input, taken)) {
      pool = poolForCategory('view', guest, rooms, input, taken, readyOnly);
    } else if (booked === 'standard') {
      const merged: Candidate[] = [];
      if (spare('corner', guest, guests, placed, rooms, input, taken)) {
        merged.push(...poolForCategory('corner', guest, rooms, input, taken, readyOnly));
      }
      if (spare('view', guest, guests, placed, rooms, input, taken)) {
        merged.push(...poolForCategory('view', guest, rooms, input, taken, readyOnly));
      }
      pool = merged;
      if (!pool.length && wheelchairEligible(guest)) {
        pool = poolForCategory('standard', guest, rooms, input, taken, readyOnly).filter((room) =>
          isWheelchairRoom(room.roomNumber),
        );
      }
    } else {
      pool = poolForCategory('standard', guest, rooms, input, taken, readyOnly);
    }
  } else {
    pool = input.mode === 'now' ? readyBooked : inBooked;
  }

  const room = pickFromPool(guest, pool, taken);
  if (!room) return null;
  if ((guest.numPax ?? 0) === 3 && isThreePersonRoom(room.roomNumber)) reasons.push('three_pax');
  if (!room.readyNow) reasons.push('not_ready');
  if (isWheelchairRoom(room.roomNumber)) reasons.push('wheelchair');
  return { room, reasons };
}

export function suggestRoomForReservation(input: RoomSuggestInput): RoomSuggestion | null {
  const match = runAssignments(input).find((row) => row.reservationId === input.reservationId);
  return match ?? null;
}

export function suggestAllRooms(input: Omit<RoomSuggestInput, 'reservationId'>): RoomSuggestion[] {
  return runAssignments({ ...input, reservationId: '' });
}

function runAssignments(input: RoomSuggestInput): RoomSuggestion[] {
  const rooms = input.rooms.map(decorate).filter((room): room is Candidate => room != null);
  const guests = input.guests.map((guest) => ({
    ...guest,
    assignedRoom: effectiveAssigned(guest, input),
  }));
  const queue = guests
    .filter((guest) => !guest.assignedRoom)
    .sort((a, b) => {
      const tier = claimTier(a) - claimTier(b);
      if (tier !== 0) return tier;
      const nights = (b.nights ?? 1) - (a.nights ?? 1);
      if (nights !== 0) return nights;
      return normalizeGuestName(a.guestName ?? '').localeCompare(normalizeGuestName(b.guestName ?? ''));
    });

  const placed = new Set<string>();
  const taken = new Set<string>();
  for (const room of Object.values(input.heldRooms ?? {})) {
    taken.add(canonicalRoom(room));
  }
  for (const guest of guests) {
    if (!guest.assignedRoom) continue;
    placed.add(guest.reservationId);
    taken.add(guest.assignedRoom);
  }
  const results: RoomSuggestion[] = [];
  const usedRooms = new Set<string>();
  for (const guest of queue) {
    const choice = chooseForGuest(guest, guests, rooms, input, placed, taken);
    if (!choice || taken.has(choice.room.roomNumber) || usedRooms.has(choice.room.roomNumber)) continue;
    placed.add(guest.reservationId);
    taken.add(choice.room.roomNumber);
    usedRooms.add(choice.room.roomNumber);
    results.push({
      reservationId: guest.reservationId,
      roomNumber: choice.room.roomNumber,
      floor: choice.room.floor,
      category: choice.room.category,
      bookedCategory: bookedRoomCategory(guest.roomType),
      readyNow: choice.room.readyNow,
      roomStatus: choice.room.status,
      reasons: choice.reasons,
    });
  }
  return results;
}

export function suggestAdjacentRoom(
  input: RoomSuggestInput,
  direction: 'up' | 'down',
): RoomSuggestion | null {
  const guest = input.guests.find((row) => row.reservationId === input.reservationId);
  if (!guest) return null;
  const plan = runAssignments(input);
  const ownHeld = input.heldRooms?.[input.reservationId];
  const mine = plan.find((row) => row.reservationId === input.reservationId);
  const currentNumber = canonicalRoom(ownHeld || mine?.roomNumber || '');
  if (!currentNumber) return null;

  const taken = new Set<string>();
  for (const row of plan) {
    if (row.reservationId !== input.reservationId) taken.add(row.roomNumber);
  }
  for (const other of input.guests) {
    if (other.reservationId === input.reservationId || !other.assignedRoom) continue;
    taken.add(canonicalRoom(other.assignedRoom));
  }
  for (const [id, room] of Object.entries(input.heldRooms ?? {})) {
    if (id === input.reservationId) continue;
    taken.add(canonicalRoom(room));
  }

  const decorated = input.rooms.map(decorate).filter((room): room is Candidate => room != null);
  const current = decorated.find((room) => room.roomNumber === currentNumber);
  const pool = applyGuestFilters(
    guest,
    decorated.filter(
      (room) => room.roomNumber !== currentNumber && stayAvailable(guest.reservationId, room, input, taken),
    ),
  );
  if (!pool.length || !current) return null;

  const rank = (room: Candidate) => room.floor * 1000 + parseInt(room.roomNumber, 10);
  const currentRank = rank(current);
  const side = [...pool]
    .filter((room) => (direction === 'up' ? rank(room) > currentRank : rank(room) < currentRank))
    .sort((a, b) => rank(a) - rank(b));
  const sameCategory = side.filter((room) => room.category === current.category);
  const pickFrom = sameCategory.length ? sameCategory : side;
  const room = direction === 'up' ? pickFrom[0] : pickFrom[pickFrom.length - 1];
  if (!room) return null;

  const reasons = profileReasons(guest);
  if ((guest.numPax ?? 0) === 3 && isThreePersonRoom(room.roomNumber)) reasons.push('three_pax');
  if (!room.readyNow) reasons.push('not_ready');
  if (isWheelchairRoom(room.roomNumber)) reasons.push('wheelchair');
  return {
    reservationId: guest.reservationId,
    roomNumber: room.roomNumber,
    floor: room.floor,
    category: room.category,
    bookedCategory: bookedRoomCategory(guest.roomType),
    readyNow: room.readyNow,
    roomStatus: room.status,
    reasons,
  };
}
