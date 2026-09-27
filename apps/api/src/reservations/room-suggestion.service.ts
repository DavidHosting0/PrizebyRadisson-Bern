import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { ChecklistTaskStatus } from '@prisma/client';
import {
  DerivedRoomStatus,
  allHotelRoomNumbers,
  formatHotelDateOnly,
  floorFromRoomNumber,
  normalizeGuestName,
  physicalRoomCategory,
  suggestAdjacentRoom,
  suggestAllRooms,
  suggestRoomForReservation,
  type RoomSuggestGuest,
  type RoomSuggestRoom,
  type RoomSuggestion,
} from '@housekeeping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { readEmmaMetadata } from '../emma/emma-room-status-sync';
import { RoomStatusService } from '../rooms/room-status.service';
import { decryptDetailBundle } from './reservation-detail-bundle';
import { decryptSensitivePayload, dateOnlyFromIso, todayIsoDate } from './reservation-sensitive';

const NAME_CACHE_DAY = 'name-counts';

type NameCache = { day: string; hotelId: string; counts: Map<string, number> };

type PlanCache = {
  hotelId: string;
  day: string;
  fingerprint: string;
  items: RoomSuggestionListItem[];
};

export type RoomSuggestionResponse = {
  suggestion: RoomSuggestion | null;
};

export type RoomSuggestionListItem = {
  reservationId: string;
  guestName: string | null;
  roomType: string | null;
  nights: number | null;
  numPax: number | null;
  vipDesc: string | null;
  tier: string | null;
  suggestion: RoomSuggestion | null;
};

@Injectable()
export class RoomSuggestionService {
  private nameCache: NameCache | null = null;
  private nameInflight: { key: string; promise: Promise<Map<string, number>> } | null = null;
  private planCache: PlanCache | null = null;
  private planInflight: { key: string; promise: Promise<RoomSuggestionListItem[]> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    @Inject(forwardRef(() => RoomStatusService))
    private readonly roomStatus: RoomStatusService,
  ) {}

  async suggest(reservationId: string, hotelId?: string): Promise<RoomSuggestionResponse> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const target = await this.findSnapshot(hid, reservationId);
    if (!target) throw new NotFoundException('Reservation not found');
    const { items } = await this.list(hid);
    const suggestion =
      items.find((item) => sameReservation(item.reservationId, target.reservationId))?.suggestion ?? null;
    return { suggestion };
  }

  async accept(reservationId: string, roomNumber: string, hotelId?: string): Promise<RoomSuggestionResponse> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const target = await this.findSnapshot(hid, reservationId);
    if (!target) throw new NotFoundException('Reservation not found');
    const room = String(parseInt(roomNumber, 10));
    if (!Number.isFinite(Number(room))) throw new NotFoundException('Room not found');
    await this.releaseRoom(hid, room, target.reservationId);
    const suggestion = lockSuggestion(target.reservationId, room);
    await this.upsertLock(hid, suggestion, 'accepted');
    return { suggestion };
  }

  async arrivingNow(reservationId: string, hotelId?: string): Promise<RoomSuggestionResponse> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const target = await this.findSnapshot(hid, reservationId);
    if (!target) throw new NotFoundException('Reservation not found');
    await this.prisma.roomSuggestionLock.deleteMany({
      where: { hotelId: hid, reservationId: target.reservationId, kind: { in: ['now', 'shift'] } },
    });
    const board = await this.loadBoard(hid);
    const suggestion = suggestRoomForReservation({
      mode: 'now',
      reservationId: canonicalReservationId(board.guests, target.reservationId),
      guests: board.guests,
      rooms: board.inventory,
      blockedRoomsByGuest: board.blocked,
      heldRooms: board.held,
    });
    if (suggestion) {
      await this.releaseRoom(hid, suggestion.roomNumber, target.reservationId);
      await this.upsertLock(hid, suggestion, 'now');
    }
    return { suggestion };
  }

  async shift(
    reservationId: string,
    direction: 'up' | 'down',
    hotelId?: string,
  ): Promise<RoomSuggestionResponse> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const target = await this.findSnapshot(hid, reservationId);
    if (!target) throw new NotFoundException('Reservation not found');
    const board = await this.loadBoard(hid);
    const reservationKey = canonicalReservationId(board.guests, target.reservationId);
    const suggestion = suggestAdjacentRoom(
      {
        mode: 'plan',
        reservationId: reservationKey,
        guests: board.guests,
        rooms: board.inventory,
        blockedRoomsByGuest: board.blocked,
        heldRooms: board.held,
      },
      direction,
    );
    if (!suggestion) return { suggestion: null };
    await this.releaseRoom(hid, suggestion.roomNumber, reservationKey);
    await this.upsertLock(hid, suggestion, 'shift');
    this.planCache = null;
    return { suggestion };
  }

  async list(hotelId?: string): Promise<{ items: RoomSuggestionListItem[] }> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const day = todayIsoDate();
    const fingerprint = await this.planFingerprint(hid, dateOnlyFromIso(day));
    if (
      this.planCache &&
      this.planCache.hotelId === hid &&
      this.planCache.day === day &&
      this.planCache.fingerprint === fingerprint
    ) {
      return { items: this.planCache.items };
    }
    const key = `${hid}|${day}|${fingerprint}`;
    if (this.planInflight?.key === key) return { items: await this.planInflight.promise };
    const promise = this.computeList(hid)
      .then((items) => {
        this.planCache = { hotelId: hid, day, fingerprint, items };
        return items;
      })
      .finally(() => {
        if (this.planInflight?.key === key) this.planInflight = null;
      });
    this.planInflight = { key, promise };
    return { items: await promise };
  }

  private async computeList(hid: string): Promise<RoomSuggestionListItem[]> {
    const board = await this.loadBoard(hid);
    const suggestions = suggestAllRooms({
      mode: 'plan',
      guests: board.guests,
      rooms: board.inventory,
      blockedRoomsByGuest: board.blocked,
      heldRooms: board.held,
    });
    const used = new Set<string>();
    for (const guest of board.guests) {
      if (guest.assignedRoom) used.add(canonicalRoomNumber(guest.assignedRoom));
    }
    const lockByGuest = new Map<string, RoomSuggestion>();
    for (const [reservationId, lock] of board.locks) {
      const roomNumber = canonicalRoomNumber(lock.roomNumber);
      if (used.has(roomNumber)) continue;
      used.add(roomNumber);
      lockByGuest.set(reservationId, { ...lock, roomNumber });
    }
    const computedByGuest = new Map<string, RoomSuggestion>();
    for (const suggestion of suggestions) {
      if (lockByGuest.has(suggestion.reservationId)) continue;
      const roomNumber = canonicalRoomNumber(suggestion.roomNumber);
      if (used.has(roomNumber)) continue;
      used.add(roomNumber);
      computedByGuest.set(suggestion.reservationId, { ...suggestion, roomNumber });
    }
    const items = board.guests
      .filter((guest) => !guest.assignedRoom)
      .map((guest) => ({
        reservationId: guest.reservationId,
        guestName: guest.guestName,
        roomType: guest.roomType,
        nights: guest.nights,
        numPax: guest.numPax,
        vipDesc: guest.vipDesc,
        tier: guest.tier,
        suggestion: lockByGuest.get(guest.reservationId) ?? computedByGuest.get(guest.reservationId) ?? null,
      }));
    return items;
  }

  private planFingerprint(hotelId: string, today: Date): Promise<string> {
    return Promise.all([
      this.prisma.reservationSnapshot.aggregate({
        where: { hotelId, arrivalDate: today, checkOut: false },
        _count: true,
        _max: { updatedAt: true },
      }),
      this.prisma.room.aggregate({
        _count: true,
        _max: { updatedAt: true, cleaningDeclaredAt: true },
      }),
      this.prisma.roomSuggestionLock.aggregate({
        where: { hotelId },
        _count: true,
        _max: { updatedAt: true },
      }),
    ]).then(([arrivals, rooms, locks]) =>
      [
        arrivals._count,
        arrivals._max.updatedAt?.toISOString() ?? '',
        rooms._count,
        rooms._max.updatedAt?.toISOString() ?? '',
        rooms._max.cleaningDeclaredAt?.toISOString() ?? '',
        locks._count,
        locks._max.updatedAt?.toISOString() ?? '',
      ].join('|'),
    );
  }

  private async loadBoard(hid: string) {
    const today = todayIsoDate();
    const todayDate = dateOnlyFromIso(today);
    const arrivals = await this.prisma.reservationSnapshot.findMany({
      where: { hotelId: hid, arrivalDate: todayDate, checkOut: false },
      select: {
        reservationId: true,
        roomId: true,
        arrivalDate: true,
        departureDate: true,
        nightsStay: true,
        roomType: true,
        tier: true,
        numPax: true,
        checkIn: true,
        checkOut: true,
        sensitiveEnc: true,
        detailEnc: true,
      },
    });

    const maxDeparture = arrivals.reduce((max, row) => {
      const iso = formatHotelDateOnly(row.departureDate);
      return iso > max ? iso : max;
    }, today);

    const occupying = await this.prisma.reservationSnapshot.findMany({
      where: {
        hotelId: hid,
        roomId: { not: null },
        checkOut: false,
        arrivalDate: { lte: dateOnlyFromIso(maxDeparture) },
        departureDate: { gte: todayDate },
      },
      select: {
        reservationId: true,
        roomId: true,
        arrivalDate: true,
        departureDate: true,
        checkIn: true,
        checkOut: true,
      },
    });

    const assignedIds = arrivals.filter((row) => row.roomId).map((row) => row.reservationId);
    if (assignedIds.length) {
      await this.prisma.roomSuggestionLock.deleteMany({
        where: { hotelId: hid, reservationId: { in: assignedIds } },
      });
    }
    const lockRows = await this.prisma.roomSuggestionLock.findMany({ where: { hotelId: hid } });
    lockRows.sort((a, b) => Number(a.kind !== 'accepted') - Number(b.kind !== 'accepted'));
    const locks = new Map<string, RoomSuggestion>();
    const heldInput: Record<string, string> = {};
    const heldRooms = new Set<string>();
    const dropLockIds: string[] = [];
    for (const row of lockRows) {
      const roomNumber = canonicalRoomNumber(row.roomNumber);
      if (heldRooms.has(roomNumber)) {
        dropLockIds.push(row.id);
        continue;
      }
      heldRooms.add(roomNumber);
      const suggestion = { ...suggestionFromLock(row), roomNumber };
      locks.set(row.reservationId, suggestion);
      heldInput[row.reservationId] = roomNumber;
    }
    if (dropLockIds.length) {
      await this.prisma.roomSuggestionLock.deleteMany({ where: { id: { in: dropLockIds } } });
    }

    const counts = await this.previousStayCounts(hid, todayDate);
    const guests = arrivals.map((row) => this.toGuest(row, counts));
    const held = remapHeld(guests, heldInput);
    const inventory = await this.inventory(occupying, today);
    const blockedRoomsByGuest: Record<string, string[]> = {};
    for (const guest of guests) {
      const arrival = guestDate(arrivals, guest.reservationId, 'arrivalDate');
      const departure = guestDate(arrivals, guest.reservationId, 'departureDate');
      blockedRoomsByGuest[guest.reservationId] = occupying
        .filter((row) => {
          if (!row.roomId || row.reservationId === guest.reservationId) return false;
          const occArrival = formatHotelDateOnly(row.arrivalDate);
          const occDeparture = formatHotelDateOnly(row.departureDate);
          return occArrival < departure && occDeparture > arrival;
        })
        .map((row) => String(parseInt(row.roomId!, 10)));
    }

    return {
      guests,
      inventory,
      blocked: blockedRoomsByGuest,
      held,
      locks,
    };
  }

  private async releaseRoom(hotelId: string, roomNumber: string, exceptReservationId: string) {
    const room = parseInt(roomNumber, 10);
    if (!Number.isFinite(room)) return;
    const rows = await this.prisma.roomSuggestionLock.findMany({
      where: { hotelId },
      select: { id: true, reservationId: true, roomNumber: true },
    });
    const ids = rows
      .filter((row) => row.reservationId !== exceptReservationId && parseInt(row.roomNumber, 10) === room)
      .map((row) => row.id);
    if (ids.length) await this.prisma.roomSuggestionLock.deleteMany({ where: { id: { in: ids } } });
  }

  private upsertLock(hotelId: string, suggestion: RoomSuggestion, kind: 'accepted' | 'now' | 'shift') {
    const data = {
      roomNumber: suggestion.roomNumber,
      kind,
      floor: suggestion.floor,
      category: suggestion.category,
      bookedCategory: suggestion.bookedCategory,
      readyNow: suggestion.readyNow,
      reasons: JSON.stringify(suggestion.reasons),
    };
    return this.prisma.roomSuggestionLock.upsert({
      where: { hotelId_reservationId: { hotelId, reservationId: suggestion.reservationId } },
      create: { hotelId, reservationId: suggestion.reservationId, ...data },
      update: data,
    });
  }

  private async findSnapshot(hotelId: string, reservationId: string) {
    const raw = reservationId.trim();
    const stripped = raw.replace(/^0+/, '') || raw;
    const candidates = [raw, stripped];
    if (/^\d+$/.test(stripped)) candidates.push(stripped.padStart(10, '0'));
    for (const id of [...new Set(candidates)]) {
      const row = await this.prisma.reservationSnapshot.findUnique({
        where: { hotelId_reservationId: { hotelId, reservationId: id } },
        select: { reservationId: true },
      });
      if (row) return row;
    }
    return null;
  }

  private toGuest(
    row: {
      reservationId: string;
      roomId: string | null;
      nightsStay: number | null;
      roomType: string | null;
      tier: string | null;
      numPax: number | null;
      sensitiveEnc: string;
      detailEnc: string | null;
    },
    counts: Map<string, number>,
  ): RoomSuggestGuest {
    const sensitive = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
    const name = sensitive?.mainGuestName ?? null;
    const detail = row.detailEnc ? decryptDetailBundle(this.cipher, row.detailEnc) : null;
    const key = name ? normalizeGuestName(name) : '';
    return {
      reservationId: row.reservationId,
      guestName: name,
      roomType: row.roomType,
      nights: row.nightsStay,
      numPax: row.numPax,
      vipDesc: sensitive?.vipDesc ?? null,
      tier: row.tier,
      country: countryFromDetail(detail?.guests),
      previousStays: key ? (counts.get(key) ?? 0) : 0,
      assignedRoom: row.roomId ? String(parseInt(row.roomId, 10)) : null,
    };
  }

  private async previousStayCounts(hotelId: string, today: Date): Promise<Map<string, number>> {
    const day = formatHotelDateOnly(today);
    if (this.nameCache && this.nameCache.hotelId === hotelId && this.nameCache.day === day) {
      return this.nameCache.counts;
    }
    const key = `${hotelId}|${day}|${NAME_CACHE_DAY}`;
    if (this.nameInflight?.key === key) return this.nameInflight.promise;
    const promise = this.prisma.reservationSnapshot
      .findMany({
        where: { hotelId, departureDate: { lt: today } },
        select: { sensitiveEnc: true },
      })
      .then((past) => {
        const counts = new Map<string, number>();
        for (const row of past) {
          const name = decryptSensitivePayload(this.cipher, row.sensitiveEnc)?.mainGuestName;
          if (!name) continue;
          const normalized = normalizeGuestName(name);
          if (!normalized) continue;
          counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
        }
        this.nameCache = { day, hotelId, counts };
        return counts;
      })
      .finally(() => {
        if (this.nameInflight?.key === key) this.nameInflight = null;
      });
    this.nameInflight = { key, promise };
    return promise;
  }

  private async inventory(
    occupying: Array<{
      roomId: string | null;
      arrivalDate: Date;
      departureDate: Date;
      checkIn: boolean;
      checkOut: boolean;
    }>,
    today: string,
  ): Promise<RoomSuggestRoom[]> {
    const dbRooms = await this.prisma.room.findMany({
      select: {
        roomNumber: true,
        outOfOrder: true,
        cleaningDeclaredAt: true,
        metadata: true,
        inspections: {
          orderBy: { inspectedAt: 'desc' },
          take: 3,
          select: { passed: true, inspectedAt: true },
        },
        checklistStates: {
          take: 1,
          select: { tasks: { select: { status: true } } },
        },
      },
    });
    const occupancy = roomOccupancy(occupying, today);
    const byNumber = new Map<string, RoomSuggestRoom>();
    for (const room of dbRooms) {
      const roomNumber = String(parseInt(room.roomNumber, 10));
      const emma = readEmmaMetadata(room.metadata);
      const tasks = room.checklistStates[0]?.tasks ?? [];
      const status = this.roomStatus.derive(
        room,
        tasks.map((task) => ({ status: task.status as ChecklistTaskStatus })),
        room.inspections,
        emma,
      );
      const occ = occupancy.get(roomNumber);
      byNumber.set(roomNumber, {
        roomNumber,
        status: room.outOfOrder ? DerivedRoomStatus.OUT_OF_ORDER : status,
        occupiedNow: occ?.occupiedNow ?? false,
        departsToday: occ?.departsToday ?? false,
      });
    }
    for (const roomNumber of allHotelRoomNumbers()) {
      if (byNumber.has(roomNumber)) continue;
      const occ = occupancy.get(roomNumber);
      byNumber.set(roomNumber, {
        roomNumber,
        status: DerivedRoomStatus.DIRTY,
        occupiedNow: occ?.occupiedNow ?? false,
        departsToday: occ?.departsToday ?? false,
      });
    }
    return [...byNumber.values()];
  }
}

function countryFromDetail(guests: Record<string, unknown>[] | undefined): string | null {
  if (!guests?.length) return null;
  const main =
    guests.find((guest) => guest.MainGuest === true || guest.MainGuest === 'X') ??
    guests.find((guest) => String(guest.GuestId ?? '').trim() === '01') ??
    guests[0];
  const value = main?.Country ?? main?.Nationality;
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function canonicalRoomNumber(roomNumber: string): string {
  const n = parseInt(roomNumber, 10);
  return Number.isFinite(n) ? String(n) : roomNumber.trim();
}

function guestDate(
  rows: Array<{ reservationId: string; arrivalDate: Date; departureDate: Date }>,
  reservationId: string,
  field: 'arrivalDate' | 'departureDate',
): string {
  const row = rows.find((item) => item.reservationId === reservationId);
  return row ? formatHotelDateOnly(row[field]) : '9999-12-31';
}

function canonicalReservationId(guests: RoomSuggestGuest[], reservationId: string): string {
  const stripped = reservationId.replace(/^0+/, '') || reservationId;
  return (
    guests.find(
      (guest) => guest.reservationId === reservationId || guest.reservationId.replace(/^0+/, '') === stripped,
    )?.reservationId ?? reservationId
  );
}

function sameReservation(a: string, b: string): boolean {
  const strip = (value: string) => value.replace(/^0+/, '') || value;
  return a === b || strip(a) === strip(b);
}

function lockSuggestion(reservationId: string, roomNumber: string): RoomSuggestion {
  return {
    reservationId,
    roomNumber,
    floor: floorFromRoomNumber(roomNumber),
    category: physicalRoomCategory(roomNumber),
    bookedCategory: 'standard',
    readyNow: true,
    reasons: [],
  };
}

function suggestionFromLock(row: {
  reservationId: string;
  roomNumber: string;
  floor: number | null;
  category: string | null;
  bookedCategory: string | null;
  readyNow: boolean;
  reasons: string;
}): RoomSuggestion {
  let reasons: RoomSuggestion['reasons'] = [];
  try {
    const parsed = JSON.parse(row.reasons) as unknown;
    if (Array.isArray(parsed)) {
      reasons = parsed.filter((item): item is RoomSuggestion['reasons'][number] => typeof item === 'string');
    }
  } catch {
    reasons = [];
  }
  const category = row.category === 'corner' || row.category === 'view' || row.category === 'standard'
    ? row.category
    : physicalRoomCategory(row.roomNumber);
  const bookedCategory =
    row.bookedCategory === 'corner' || row.bookedCategory === 'view' || row.bookedCategory === 'standard'
      ? row.bookedCategory
      : 'standard';
  return {
    reservationId: row.reservationId,
    roomNumber: row.roomNumber,
    floor: row.floor,
    category,
    bookedCategory,
    readyNow: row.readyNow,
    reasons,
  };
}

function remapHeld(guests: RoomSuggestGuest[], held: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, room] of Object.entries(held)) {
    const match = canonicalReservationId(guests, id);
    const guest = guests.find((item) => item.reservationId === match);
    if (!guest) continue;
    const n = parseInt(room, 10);
    if (!Number.isFinite(n)) continue;
    out[guest.reservationId] = String(n);
  }
  return out;
}

function roomOccupancy(
  rows: Array<{
    roomId: string | null;
    arrivalDate: Date;
    departureDate: Date;
    checkIn: boolean;
    checkOut: boolean;
  }>,
  today: string,
): Map<string, { occupiedNow: boolean; departsToday: boolean }> {
  const map = new Map<string, { occupiedNow: boolean; departsToday: boolean }>();
  for (const row of rows) {
    if (!row.roomId || row.checkOut || !row.checkIn) continue;
    const arrival = formatHotelDateOnly(row.arrivalDate);
    const departure = formatHotelDateOnly(row.departureDate);
    if (arrival > today || departure < today) continue;
    const roomNumber = String(parseInt(row.roomId, 10));
    const prev = map.get(roomNumber);
    map.set(roomNumber, {
      occupiedNow: true,
      departsToday: (prev?.departsToday ?? false) || departure === today,
    });
  }
  return map;
}

export function parseHeldRooms(raw?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw?.trim()) return out;
  for (const part of raw.split(',')) {
    const idx = part.lastIndexOf(':');
    if (idx <= 0) continue;
    const id = part.slice(0, idx).trim();
    const room = part.slice(idx + 1).trim();
    if (id && room) out[id] = room;
  }
  return out;
}
