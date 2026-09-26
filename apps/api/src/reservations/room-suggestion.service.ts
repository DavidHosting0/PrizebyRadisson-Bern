import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { ChecklistTaskStatus } from '@prisma/client';
import {
  DerivedRoomStatus,
  allHotelRoomNumbers,
  formatHotelDateOnly,
  normalizeGuestName,
  suggestRoomForReservation,
  type RoomSuggestGuest,
  type RoomSuggestMode,
  type RoomSuggestRoom,
  type RoomSuggestion,
} from '@housekeeping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { readEmmaMetadata } from '../emma/emma-room-status-sync';
import { RoomStatusService } from '../rooms/room-status.service';
import { decryptDetailBundle } from './reservation-detail-bundle';
import { decryptSensitivePayload, dateOnlyFromIso, todayIsoDate } from './reservation-sensitive';

const NAME_CACHE_MS = 60_000;

type NameCache = { at: number; hotelId: string; counts: Map<string, number> };

export type RoomSuggestionResponse = {
  suggestion: RoomSuggestion | null;
};

@Injectable()
export class RoomSuggestionService {
  private nameCache: NameCache | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    @Inject(forwardRef(() => RoomStatusService))
    private readonly roomStatus: RoomStatusService,
  ) {}

  async suggest(
    reservationId: string,
    mode: RoomSuggestMode,
    hotelId?: string,
    heldRooms?: Record<string, string>,
  ): Promise<RoomSuggestionResponse> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const today = todayIsoDate();
    const todayDate = dateOnlyFromIso(today);
    const target = await this.findSnapshot(hid, reservationId);
    if (!target) throw new NotFoundException('Reservation not found');

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

    const counts = await this.previousStayCounts(hid, todayDate);
    const guests = arrivals.map((row) => this.toGuest(row, counts));
    const held = remapHeld(guests, heldRooms ?? {});
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

    const suggestion = suggestRoomForReservation({
      mode,
      reservationId: canonicalReservationId(guests, target.reservationId),
      guests,
      rooms: inventory,
      blockedRoomsByGuest,
      heldRooms: held,
    });
    return { suggestion };
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
    const now = Date.now();
    if (this.nameCache && this.nameCache.hotelId === hotelId && now - this.nameCache.at < NAME_CACHE_MS) {
      return this.nameCache.counts;
    }
    const past = await this.prisma.reservationSnapshot.findMany({
      where: { hotelId, departureDate: { lt: today } },
      select: { sensitiveEnc: true },
    });
    const counts = new Map<string, number>();
    for (const row of past) {
      const name = decryptSensitivePayload(this.cipher, row.sensitiveEnc)?.mainGuestName;
      if (!name) continue;
      const key = normalizeGuestName(name);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    this.nameCache = { at: now, hotelId, counts };
    return counts;
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
