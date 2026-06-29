import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RoomGuestStaySource } from '@prisma/client';
import type { ReservationUpsertRow } from '../emma/emma-reservation-sync';
import { normalizeEmmaRoomNumber } from '../emma/emma-room-status-sync';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSensitivePayload } from '../reservations/reservation-sensitive';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import {
  decideGuestStaySyncAction,
  shouldBackfillGuestStay,
} from './room-guest-stay-logic';

export type GuestStayListFlags = {
  inCheckInDone: boolean;
};

type StayFieldPayload = {
  mainGuestNameEnc: string;
  stayover: boolean;
  expectedDepartureTime: string | null;
};

@Injectable()
export class RoomGuestStayService implements OnModuleInit {
  private readonly log = new Logger(RoomGuestStayService.name);
  private readonly localRoomIdCache = new Map<string, string>();
  private backfillDone = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.ROOM_GUEST_STAY_BACKFILL === 'false') return;
    try {
      await this.backfillFromSnapshots();
    } catch (err) {
      this.log.warn(`Guest stay backfill failed: ${(err as Error).message}`);
    }
  }

  /** Record or update guest stay from an EMMA reservation sync row. */
  async recordFromSync(
    row: ReservationUpsertRow,
    listFlags: GuestStayListFlags,
    opts?: {
      forceSource?: RoomGuestStaySource;
      createCheckedOut?: boolean;
    },
  ): Promise<void> {
    const syncedAt = row.syncedAt ?? new Date();
    const openStay = await this.findOpenStay(row.hotelId, row.reservationId);
    const action = decideGuestStaySyncAction(
      {
        roomId: row.roomId,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        inCheckInDone: listFlags.inCheckInDone,
      },
      openStay,
    );

    const fields = this.extractStayFields(row.sensitiveEnc);
    const localRoomId = row.roomId ? await this.resolveLocalRoomId(row.roomId) : null;

    switch (action.kind) {
      case 'skip':
        return;
      case 'checkout': {
        if (openStay) {
          await this.prisma.roomGuestStay.update({
            where: { id: openStay.id },
            data: {
              checkedOut: true,
              checkOutAt: openStay.checkOutAt ?? syncedAt,
              lastSeenAt: syncedAt,
              departureDate: row.departureDate,
              arrivalDate: row.arrivalDate,
              ...fields,
              roomId: localRoomId,
            },
          });
          return;
        }
        if (!opts?.createCheckedOut || !row.roomId?.trim()) return;
        const roomNumber = normalizeEmmaRoomNumber(row.roomId);
        const existingClosed = await this.prisma.roomGuestStay.findFirst({
          where: {
            hotelId: row.hotelId,
            reservationId: row.reservationId,
            roomNumber,
            checkedOut: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existingClosed) {
          await this.prisma.roomGuestStay.update({
            where: { id: existingClosed.id },
            data: {
              lastSeenAt: syncedAt,
              departureDate: row.departureDate,
              arrivalDate: row.arrivalDate,
              ...fields,
              roomId: localRoomId,
            },
          });
          return;
        }
        await this.prisma.roomGuestStay.create({
          data: {
            hotelId: row.hotelId,
            reservationId: row.reservationId,
            roomNumber,
            roomId: localRoomId,
            arrivalDate: row.arrivalDate,
            departureDate: row.departureDate,
            checkInAt: syncedAt,
            checkOutAt: syncedAt,
            checkedOut: true,
            source: opts.forceSource ?? this.resolveSource(listFlags, row.checkIn),
            lastSeenAt: syncedAt,
            ...fields,
          },
        });
        return;
      }
      case 'create': {
        await this.prisma.roomGuestStay.create({
          data: {
            hotelId: row.hotelId,
            reservationId: row.reservationId,
            roomNumber: action.roomNumber,
            roomId: localRoomId,
            arrivalDate: row.arrivalDate,
            departureDate: row.departureDate,
            checkInAt: syncedAt,
            checkedOut: opts?.createCheckedOut ?? false,
            checkOutAt: opts?.createCheckedOut ? syncedAt : null,
            source: opts?.forceSource ?? this.resolveSource(listFlags, row.checkIn),
            lastSeenAt: syncedAt,
            ...fields,
          },
        });
        return;
      }
      case 'update': {
        if (!openStay) return;
        await this.prisma.roomGuestStay.update({
          where: { id: openStay.id },
          data: {
            arrivalDate: row.arrivalDate,
            departureDate: row.departureDate,
            roomId: localRoomId,
            lastSeenAt: syncedAt,
            ...fields,
            source: this.mergeSource(openStay.source, listFlags, row.checkIn, opts?.forceSource),
            checkInAt: openStay.checkInAt ?? syncedAt,
          },
        });
        return;
      }
      case 'room_change': {
        if (openStay) {
          await this.prisma.roomGuestStay.update({
            where: { id: openStay.id },
            data: {
              checkedOut: true,
              checkOutAt: syncedAt,
              lastSeenAt: syncedAt,
            },
          });
        }
        await this.prisma.roomGuestStay.create({
          data: {
            hotelId: row.hotelId,
            reservationId: row.reservationId,
            roomNumber: action.roomNumber,
            roomId: localRoomId,
            arrivalDate: row.arrivalDate,
            departureDate: row.departureDate,
            checkInAt: syncedAt,
            checkedOut: false,
            source: opts?.forceSource ?? this.resolveSource(listFlags, row.checkIn),
            lastSeenAt: syncedAt,
            ...fields,
          },
        });
        return;
      }
    }
  }

  /** Close open stays for reservations no longer reported in-house by EMMA. */
  async closeStaysNotInHouse(
    hotelId: string,
    activeReservationIds: string[],
    at: Date,
  ): Promise<number> {
    const result = await this.prisma.roomGuestStay.updateMany({
      where: {
        hotelId,
        checkedOut: false,
        ...(activeReservationIds.length > 0
          ? { reservationId: { notIn: activeReservationIds } }
          : {}),
      },
      data: {
        checkedOut: true,
        checkOutAt: at,
        lastSeenAt: at,
      },
    });
    return result.count;
  }

  /** Purge archived stays whose departure is before cutoff. */
  async purgeExpired(cutoff: Date): Promise<number> {
    const result = await this.prisma.roomGuestStay.deleteMany({
      where: { departureDate: { lt: cutoff } },
    });
    return result.count;
  }

  /** One-time idempotent backfill from existing reservation snapshots. */
  async backfillFromSnapshots(): Promise<number> {
    if (this.backfillDone) return 0;
    const hotelId = process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const snapshots = await this.prisma.reservationSnapshot.findMany({
      where: {
        hotelId,
        roomId: { not: null },
        OR: [{ checkIn: true }, { inCheckInDone: true }, { checkOut: true }],
      },
    });

    let processed = 0;
    for (const snap of snapshots) {
      if (!shouldBackfillGuestStay(snap)) continue;
      const row: ReservationUpsertRow = {
        hotelId: snap.hotelId,
        reservationId: snap.reservationId,
        arrivalDate: snap.arrivalDate,
        departureDate: snap.departureDate,
        roomId: snap.roomId,
        checkIn: snap.checkIn,
        checkOut: snap.checkOut,
        checkInQueue: snap.checkInQueue,
        nightsStay: snap.nightsStay,
        roomType: snap.roomType,
        mealPlan: snap.mealPlan,
        tier: snap.tier,
        numPax: snap.numPax,
        sensitiveEnc: snap.sensitiveEnc,
        syncedAt: snap.syncedAt,
      };
      await this.recordFromSync(
        row,
        { inCheckInDone: snap.inCheckInDone },
        {
          forceSource: RoomGuestStaySource.BACKFILL,
          createCheckedOut: snap.checkOut,
        },
      );
      processed++;
    }

    this.backfillDone = true;
    if (processed > 0) {
      this.log.log(`Backfilled ${processed} guest stays from ${snapshots.length} snapshots`);
    }
    return processed;
  }

  private async findOpenStay(hotelId: string, reservationId: string) {
    return this.prisma.roomGuestStay.findFirst({
      where: { hotelId, reservationId, checkedOut: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  private extractStayFields(sensitiveEnc: string): StayFieldPayload {
    const sensitive = decryptSensitivePayload(this.cipher, sensitiveEnc);
    return {
      mainGuestNameEnc: sensitiveEnc,
      stayover: sensitive?.stayover ?? false,
      expectedDepartureTime: sensitive?.expectedDepartureTime ?? null,
    };
  }

  private resolveSource(
    listFlags: GuestStayListFlags,
    checkIn: boolean,
    force?: RoomGuestStaySource,
  ): RoomGuestStaySource {
    if (force) return force;
    if (listFlags.inCheckInDone) return RoomGuestStaySource.CHECK_INS_DONE;
    if (checkIn) return RoomGuestStaySource.IN_HOUSE;
    return RoomGuestStaySource.IN_HOUSE;
  }

  private mergeSource(
    current: RoomGuestStaySource,
    listFlags: GuestStayListFlags,
    checkIn: boolean,
    force?: RoomGuestStaySource,
  ): RoomGuestStaySource {
    if (force) return force;
    if (listFlags.inCheckInDone) return RoomGuestStaySource.CHECK_INS_DONE;
    if (checkIn) return RoomGuestStaySource.IN_HOUSE;
    return current;
  }

  private async resolveLocalRoomId(roomNumber: string): Promise<string | null> {
    const normalized = normalizeEmmaRoomNumber(roomNumber);
    const cached = this.localRoomIdCache.get(normalized);
    if (cached) return cached;

    const room = await this.prisma.room.findFirst({
      where: {
        OR: [{ roomNumber: normalized }, { roomNumber }],
      },
      select: { id: true },
    });
    if (room) {
      this.localRoomIdCache.set(normalized, room.id);
      return room.id;
    }
    return null;
  }
}
