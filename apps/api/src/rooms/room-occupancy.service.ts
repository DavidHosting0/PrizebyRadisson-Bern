import { Injectable } from '@nestjs/common';
import type { RoomOccupancy } from '@housekeeping/shared';
import {
  deriveGuestStaySignals,
  formatHotelDateOnly,
  hotelTodayIso,
} from '@housekeeping/shared';
import { normalizeEmmaRoomNumber } from '../emma/emma-room-status-sync';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSensitivePayload,
  todayIsoDate,
} from '../reservations/reservation-sensitive';
import { dateOnlyFromIso } from '../assignments/assignment-balancer';

type SnapshotRow = {
  reservationId: string;
  roomId: string | null;
  arrivalDate: Date;
  departureDate: Date;
  checkOut: boolean;
  sensitiveEnc: string;
  syncedAt: Date;
};

@Injectable()
export class RoomOccupancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
  ) {}

  async mapForRoomNumbers(roomNumbers: string[]): Promise<Map<string, RoomOccupancy>> {
    const out = new Map<string, RoomOccupancy>();
    if (roomNumbers.length === 0) return out;

    const normalizedToLocal = new Map<string, string>();
    for (const n of roomNumbers) {
      normalizedToLocal.set(normalizeEmmaRoomNumber(n), n);
      normalizedToLocal.set(n, n);
    }

    const today = todayIsoDate();
    const todayDate = dateOnlyFromIso(today);
    const snapshots = await this.prisma.reservationSnapshot.findMany({
      where: {
        checkIn: true,
        roomId: { not: null },
        OR: [{ checkOut: false }, { departureDate: todayDate }],
      },
      select: {
        reservationId: true,
        roomId: true,
        arrivalDate: true,
        departureDate: true,
        checkOut: true,
        sensitiveEnc: true,
        syncedAt: true,
      },
    });

    const byRoom = new Map<string, SnapshotRow[]>();
    for (const snap of snapshots) {
      const rawRoom = snap.roomId?.trim();
      if (!rawRoom) continue;
      const local = normalizedToLocal.get(normalizeEmmaRoomNumber(rawRoom));
      if (!local) continue;
      const list = byRoom.get(local) ?? [];
      list.push(snap);
      byRoom.set(local, list);
    }

    for (const [roomNumber, rows] of byRoom) {
      const picked = this.pickBestRow(rows, today);
      if (!picked) continue;
      const occ = this.toOccupancy(picked, today);
      if (occ) out.set(roomNumber, occ);
    }

    // After checkout Emma may drop roomId from the live snapshot — RoomGuestStay still
    // remembers today's departures so the board can keep departure styling.
    const missing = roomNumbers.filter((n) => !out.has(n));
    if (missing.length > 0) {
      const norms = [...new Set(missing.flatMap((n) => [n, normalizeEmmaRoomNumber(n)]))];
      const stays = await this.prisma.roomGuestStay.findMany({
        where: {
          departureDate: todayDate,
          OR: [
            { roomNumber: { in: norms } },
            { room: { roomNumber: { in: missing } } },
          ],
        },
        orderBy: { lastSeenAt: 'desc' },
      });
      for (const stay of stays) {
        const roomNumber =
          normalizedToLocal.get(normalizeEmmaRoomNumber(stay.roomNumber)) ??
          normalizedToLocal.get(stay.roomNumber);
        if (!roomNumber || out.has(roomNumber)) continue;

        const departureDate = formatHotelDateOnly(stay.departureDate);
        const arrivalDate = formatHotelDateOnly(stay.arrivalDate);
        const staySignals = deriveGuestStaySignals({
          arrivalDate,
          departureDate,
          today,
          checkOut: stay.checkedOut,
          stayover: stay.stayover,
          inHouse: !stay.checkedOut,
        });
        const payload = decryptSensitivePayload(this.cipher, stay.mainGuestNameEnc);
        out.set(roomNumber, {
          reservationId: stay.reservationId,
          mainGuestName: payload?.mainGuestName?.trim() || null,
          departureDate,
          isDepartureToday: true,
          isArrivalToday: staySignals.isArrivalToday ?? false,
          isRestant: false,
          checkOut: stay.checkedOut,
          stayover: stay.stayover,
          expectedDepartureTime: stay.expectedDepartureTime,
          ocoDone: false,
        });
      }
    }

    return out;
  }

  /** Stamp / clear departureStickyOn so checkout does not lose departure-for-today. */
  async syncDepartureSticky(
    rooms: Array<{
      id: string;
      derivedStatus: string;
      occupancy?: RoomOccupancy | null;
      departureStickyOn?: Date | null;
    }>,
  ): Promise<Map<string, boolean>> {
    const today = hotelTodayIso();
    const todayDate = dateOnlyFromIso(today);
    const stickyTodayById = new Map<string, boolean>();

    await this.prisma.room.updateMany({
      where: {
        departureStickyOn: { not: null, lt: todayDate },
      },
      data: { departureStickyOn: null },
    });

    const stampIds: string[] = [];
    const clearIds: string[] = [];

    for (const room of rooms) {
      const sticky =
        room.departureStickyOn != null &&
        formatHotelDateOnly(room.departureStickyOn) === today;
      const isDepartLive = room.occupancy?.isDepartureToday === true;
      const inspected = room.derivedStatus === 'INSPECTED';

      if (inspected && sticky) {
        clearIds.push(room.id);
        stickyTodayById.set(room.id, false);
        continue;
      }

      if (isDepartLive && !inspected && !sticky) {
        stampIds.push(room.id);
        stickyTodayById.set(room.id, true);
        continue;
      }

      stickyTodayById.set(room.id, sticky && !inspected);
    }

    if (stampIds.length) {
      await this.prisma.room.updateMany({
        where: { id: { in: stampIds } },
        data: { departureStickyOn: todayDate },
      });
    }
    if (clearIds.length) {
      await this.prisma.room.updateMany({
        where: { id: { in: clearIds } },
        data: { departureStickyOn: null },
      });
    }

    return stickyTodayById;
  }

  applyStickyDeparture(
    occupancy: RoomOccupancy | null | undefined,
    stickyToday: boolean,
  ): RoomOccupancy | null {
    if (!stickyToday && !occupancy?.isDepartureToday) return occupancy ?? null;
    if (!stickyToday) return occupancy ?? null;
    if (occupancy) {
      return { ...occupancy, isDepartureToday: true, isRestant: false };
    }
    const today = hotelTodayIso();
    return {
      reservationId: '',
      mainGuestName: null,
      departureDate: today,
      isDepartureToday: true,
      isArrivalToday: false,
      isRestant: false,
      checkOut: true,
      stayover: false,
      expectedDepartureTime: null,
      ocoDone: false,
    };
  }

  private pickBestRow(rows: SnapshotRow[], today: string): SnapshotRow | null {
    if (rows.length === 0) return null;
    const scored = [...rows].sort((a, b) => {
      const score = (r: SnapshotRow) => {
        let s = 0;
        // Prefer today's departure (incl. already checked out) over other in-house rows
        if (formatHotelDateOnly(r.departureDate) === today) s += 120;
        if (!r.checkOut) s += 40;
        return s;
      };
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return b.syncedAt.getTime() - a.syncedAt.getTime();
    });
    return scored[0] ?? null;
  }

  private toOccupancy(row: SnapshotRow, today: string): RoomOccupancy | null {
    const sensitive = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
    if (!sensitive) return null;
    const departureDate = formatHotelDateOnly(row.departureDate);
    const arrivalDate = formatHotelDateOnly(row.arrivalDate);
    const stay = deriveGuestStaySignals({
      arrivalDate,
      departureDate,
      today,
      checkOut: row.checkOut,
      stayover: sensitive.stayover,
      ocoDone: sensitive.ocoDone,
      inHouse: !row.checkOut,
    });
    // Departure day stays departure even after checkout (until sticky cleared by inspection).
    const isDepartureToday = departureDate === today;
    return {
      reservationId: row.reservationId,
      mainGuestName: sensitive.mainGuestName,
      departureDate,
      isDepartureToday,
      isArrivalToday: stay.isArrivalToday ?? false,
      isRestant: isDepartureToday ? false : (stay.isRestant ?? false),
      checkOut: row.checkOut,
      stayover: sensitive.stayover,
      expectedDepartureTime: sensitive.expectedDepartureTime,
      ocoDone: sensitive.ocoDone,
    };
  }
}
