import { Injectable, Logger } from '@nestjs/common';
import type { DailyDeparturesResponse } from '@housekeeping/shared';
import { floorFromRoomNumber, hotelTodayIso } from '@housekeeping/shared';
import { AssignmentStatus } from '@prisma/client';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { userPublicSelect } from '../common/user-public.select';
import { normalizeEmmaRoomNumber } from '../emma/emma-room-status-sync';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSensitivePayload } from '../reservations/reservation-sensitive';
import { ReservationsService } from '../reservations/reservations.service';
import { buildEmmaCountWarnings, matchesDepartureDateQuery } from './departure-query';

export type DepartureRoomCandidate = {
  roomId: string;
  roomNumber: string;
  floor: number | null;
  outOfOrder: boolean;
  reservationId: string;
  mainGuestName: string | null;
  expectedDepartureTime: string | null;
  checkOut: boolean;
  assignedHousekeeper: {
    id: string;
    name: string;
    titlePrefix: string;
  } | null;
};

@Injectable()
export class DeparturesService {
  private readonly logger = new Logger(DeparturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly reservations: ReservationsService,
  ) {}

  async listForDate(dateInput?: string, hotelId?: string): Promise<DailyDeparturesResponse> {
    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const today = hotelTodayIso();
    const date = dateInput?.trim() || today;
    const departureDate = new Date(`${date}T00:00:00.000Z`);

    const snapshots = await this.prisma.reservationSnapshot.findMany({
      where: {
        hotelId: hid,
        departureDate,
        checkIn: true,
        roomId: { not: null },
        OR: [{ checkOut: false }, ...(date === today ? [{ checkOut: true }] : [])],
      },
      orderBy: [{ roomId: 'asc' }, { reservationId: 'asc' }],
    });

    const filtered = snapshots.filter((row) => matchesDepartureDateQuery(row, date, today));

    const localRooms = await this.prisma.room.findMany({
      select: {
        id: true,
        roomNumber: true,
        floor: true,
        outOfOrder: true,
        assignments: {
          where: { status: AssignmentStatus.ACTIVE },
          take: 1,
          select: {
            housekeeper: { select: userPublicSelect },
          },
        },
      },
    });

    const roomByNumber = new Map<string, (typeof localRooms)[number]>();
    for (const room of localRooms) {
      roomByNumber.set(room.roomNumber, room);
      roomByNumber.set(normalizeEmmaRoomNumber(room.roomNumber), room);
    }

    const items: DailyDeparturesResponse['items'] = [];
    const unmappedRooms: DailyDeparturesResponse['unmappedRooms'] = [];
    let latestSync: Date | null = null;

    for (const snap of filtered) {
      if (snap.syncedAt && (!latestSync || snap.syncedAt > latestSync)) {
        latestSync = snap.syncedAt;
      }
      const emmaRoomId = snap.roomId?.trim() ?? '';
      const local = roomByNumber.get(normalizeEmmaRoomNumber(emmaRoomId));
      if (!local) {
        unmappedRooms.push({ emmaRoomId, reservationId: snap.reservationId });
        continue;
      }

      const sensitive = decryptSensitivePayload(this.cipher, snap.sensitiveEnc);
      const activeAssignment = local.assignments[0];
      items.push({
        reservationId: snap.reservationId,
        roomId: local.id,
        roomNumber: local.roomNumber,
        floor: local.floor ?? floorFromRoomNumber(local.roomNumber),
        mainGuestName: sensitive?.mainGuestName ?? null,
        expectedDepartureTime: sensitive?.expectedDepartureTime ?? null,
        checkOut: snap.checkOut,
        assignedHousekeeper: activeAssignment?.housekeeper ?? null,
      });
    }

    items.sort((a, b) => {
      const fa = a.floor ?? 9999;
      const fb = b.floor ?? 9999;
      if (fa !== fb) return fa - fb;
      return a.roomNumber.localeCompare(b.roomNumber, 'de', { numeric: true });
    });

    const overview = date === today ? await this.reservations.overview(hid) : null;
    const emmaExpectedCount = overview?.departures ?? null;
    const warnings = buildEmmaCountWarnings(items.length, unmappedRooms.length, emmaExpectedCount, date, today);

    if (warnings.length) {
      this.logger.warn(`[Departures] ${warnings[0]}`);
    }

    return {
      date,
      items,
      emmaExpectedCount,
      syncedAt: latestSync?.toISOString() ?? overview?.lastSyncedAt ?? null,
      unmappedRooms,
      warnings,
    };
  }

  async listAssignableDepartureRooms(dateInput?: string, hotelId?: string): Promise<DepartureRoomCandidate[]> {
    const list = await this.listForDate(dateInput, hotelId);
    const localRooms = await this.prisma.room.findMany({
      where: { id: { in: list.items.map((i) => i.roomId) } },
      select: {
        id: true,
        roomNumber: true,
        floor: true,
        outOfOrder: true,
      },
    });
    const roomMeta = new Map(localRooms.map((r) => [r.id, r]));

    return list.items
      .filter((item) => !item.assignedHousekeeper)
      .map((item) => {
        const meta = roomMeta.get(item.roomId);
        return {
          roomId: item.roomId,
          roomNumber: item.roomNumber,
          floor: item.floor,
          outOfOrder: meta?.outOfOrder ?? false,
          reservationId: item.reservationId,
          mainGuestName: item.mainGuestName,
          expectedDepartureTime: item.expectedDepartureTime,
          checkOut: item.checkOut,
          assignedHousekeeper: item.assignedHousekeeper,
        };
      })
      .filter((r) => !r.outOfOrder);
  }

  async refreshFromEmma(): Promise<DailyDeparturesResponse> {
    await this.reservations.syncFromEmma(undefined, 'departures.refresh');
    return this.listForDate();
  }
}
