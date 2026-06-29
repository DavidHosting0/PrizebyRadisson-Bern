import { ForbiddenException, Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import type { FrontOfficeBackupOverview } from '@housekeeping/shared';
import { formatHotelDateOnly } from '@housekeeping/shared';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmmaBackupModeService } from '../emma/emma-backup-mode.service';
import { readEmmaMetadata, normalizeEmmaRoomNumber } from '../emma/emma-room-status-sync';
import { decryptSensitivePayload } from '../reservations/reservation-sensitive';
import { RoomStatusService } from '../rooms/room-status.service';
import { compareRoomNumbers, floorFromRoomNumber } from '../rooms/room-layout';

@Injectable()
export class FrontOfficeBackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly roomStatus: RoomStatusService,
    private readonly backupMode: EmmaBackupModeService,
  ) {}

  async getOverview(user: User, hotelId?: string): Promise<FrontOfficeBackupOverview> {
    const backup = await this.backupMode.getState();
    if (user.role !== UserRole.ADMIN && !backup.active) {
      throw new ForbiddenException('EMMA backup mode is not active');
    }

    const hid = hotelId?.trim() || process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const generatedAt = new Date();

    const [rooms, snapshots, lastOkSync, lastSyncRun] = await Promise.all([
      this.prisma.room.findMany({
        include: {
          checklistStates: {
            take: 1,
            include: { tasks: true },
          },
          inspections: { orderBy: { inspectedAt: 'desc' }, take: 3 },
        },
      }),
      this.prisma.reservationSnapshot.findMany({
        where: { hotelId: hid },
      }),
      this.prisma.reservationSyncRun.findFirst({
        where: { status: 'ok' },
        orderBy: { finishedAt: 'desc' },
      }),
      this.prisma.reservationSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);

    rooms.sort((a, b) => {
      const fa = a.floor ?? floorFromRoomNumber(a.roomNumber) ?? Number.POSITIVE_INFINITY;
      const fb = b.floor ?? floorFromRoomNumber(b.roomNumber) ?? Number.POSITIVE_INFINITY;
      if (fa !== fb) return fa - fb;
      return compareRoomNumbers(a.roomNumber, b.roomNumber);
    });

    const emmaSyncedTimes: number[] = [];
    const roomRows = rooms.map((room) => {
      const state = room.checklistStates[0];
      const tasks = state?.tasks ?? [];
      const emmaMeta = readEmmaMetadata(room.metadata);
      if (emmaMeta?.syncedAt) {
        emmaSyncedTimes.push(new Date(emmaMeta.syncedAt).getTime());
      }
      const floor = room.floor ?? floorFromRoomNumber(room.roomNumber) ?? null;
      return {
        roomId: room.id,
        roomNumber: room.roomNumber,
        floor,
        derivedStatus: this.roomStatus.derive(room, tasks, room.inspections, emmaMeta),
        outOfOrder: room.outOfOrder,
        emmaStatusCode: emmaMeta?.statusCode ?? null,
        emmaStatusLabel: emmaMeta?.statusLabel ?? null,
        cleaningDeclaredAt: room.cleaningDeclaredAt?.toISOString() ?? null,
        emmaSyncedAt: emmaMeta?.syncedAt ?? null,
        updatedAt: room.updatedAt.toISOString(),
      };
    });

    const toReservationRow = (row: (typeof snapshots)[number]) => {
      const s = decryptSensitivePayload(this.cipher, row.sensitiveEnc);
      const roomNumber = row.roomId?.trim()
        ? normalizeEmmaRoomNumber(row.roomId.trim())
        : null;
      return {
        id: row.id,
        reservationId: row.reservationId,
        mainGuestName: s?.mainGuestName ?? null,
        roomId: row.roomId,
        roomNumber,
        arrivalDate: formatHotelDateOnly(row.arrivalDate),
        departureDate: formatHotelDateOnly(row.departureDate),
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        checkInQueue: row.checkInQueue,
        inTodayArrivals: row.inTodayArrivals,
        balance: s?.balance ?? null,
        syncedAt: row.syncedAt.toISOString(),
      };
    };

    const checkedIn = snapshots
      .filter((r) => r.checkIn && !r.checkOut)
      .map(toReservationRow)
      .sort((a, b) => compareRoomNumbers(a.roomNumber ?? '', b.roomNumber ?? ''));

    const pendingCheckIn = snapshots
      .filter(
        (r) =>
          !r.checkIn &&
          !r.checkOut &&
          (r.inTodayArrivals || r.checkInQueue),
      )
      .map(toReservationRow)
      .sort((a, b) => a.mainGuestName?.localeCompare(b.mainGuestName ?? '') ?? 0);

    const activeForSharing = snapshots.filter(
      (r) =>
        !r.checkOut &&
        r.roomId?.trim() &&
        (r.checkIn || r.inTodayArrivals || r.checkInQueue),
    );

    const byRoom = new Map<string, ReturnType<typeof toReservationRow>[]>();
    for (const row of activeForSharing) {
      const key = normalizeEmmaRoomNumber(row.roomId!.trim());
      const list = byRoom.get(key) ?? [];
      list.push(toReservationRow(row));
      byRoom.set(key, list);
    }

    const sharedRooms = [...byRoom.entries()]
      .filter(([, res]) => res.length > 1)
      .map(([roomNumber, reservations]) => ({
        roomNumber,
        reservations: reservations.sort(
          (a, b) => a.mainGuestName?.localeCompare(b.mainGuestName ?? '') ?? 0,
        ),
      }))
      .sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber));

    const sortedEmmaTimes = emmaSyncedTimes.filter((t) => t > 0).sort((a, b) => a - b);

    return {
      freshness: {
        generatedAt: generatedAt.toISOString(),
        reservationsLastSyncedAt: lastOkSync?.finishedAt?.toISOString() ?? null,
        reservationsLastSyncStatus:
          lastSyncRun?.status === 'ok' ||
          lastSyncRun?.status === 'error' ||
          lastSyncRun?.status === 'running'
            ? lastSyncRun.status
            : null,
        reservationsLastSyncError: lastSyncRun?.status === 'error' ? lastSyncRun.error : null,
        roomsNewestEmmaSyncedAt:
          sortedEmmaTimes.length > 0
            ? new Date(sortedEmmaTimes[sortedEmmaTimes.length - 1]!).toISOString()
            : null,
        roomsOldestEmmaSyncedAt:
          sortedEmmaTimes.length > 0
            ? new Date(sortedEmmaTimes[0]!).toISOString()
            : null,
      },
      rooms: roomRows,
      checkedIn,
      pendingCheckIn,
      sharedRooms,
    };
  }
}
