import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PermissionCode, RoomGuestStaySource, UserRole } from '@prisma/client';
import { hotelTodayIso } from '@housekeeping/shared';
import type { RoomManagementDetailDto } from '@housekeeping/shared';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { userPublicSelect } from '../common/user-public.select';
import { DamageReportsService } from '../damage-reports/damage-reports.service';
import { LostFoundService } from '../lost-found/lost-found.service';
import { PhotosService } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSensitivePayload } from '../reservations/reservation-sensitive';
import { RoomsService } from '../rooms/rooms.service';
import { normalizeEmmaRoomNumber } from '../emma/emma-room-status-sync';
import {
  guestStayPresence,
  matchesGuestStayDateRange,
  matchesGuestStayForRoom,
} from './guest-stay-query';

@Injectable()
export class RoomManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly damageReports: DamageReportsService,
    private readonly lostFound: LostFoundService,
    private readonly cipher: SecretCipherService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private photosService(): PhotosService | null {
    try {
      return this.moduleRef.get(PhotosService, { strict: false });
    } catch {
      return null;
    }
  }

  async getDetail(
    roomId: string,
    viewer: AuthenticatedUser,
    query: { from?: string; to?: string },
  ): Promise<RoomManagementDetailDto> {
    const room = await this.rooms.findOne(roomId, viewer);
    if (!room) throw new NotFoundException('Room not found');

    const canViewGuests = this.hasPermission(viewer, PermissionCode.RESERVATIONS_READ);
    const canViewPhotos = this.hasPermission(viewer, PermissionCode.PHOTO_TIMELINE_READ);
    const canViewDamages = this.hasPermission(viewer, PermissionCode.DAMAGE_REPORT_READ);
    const canViewLostFound = this.hasPermission(viewer, PermissionCode.LOST_FOUND_READ);

    const [guestStays, inspections, housekeepingEvents, assignments, photos, damages, lostFound] =
      await Promise.all([
        canViewGuests
          ? this.loadGuestStays(room.roomNumber, query.from, query.to)
          : Promise.resolve([]),
        this.loadInspections(roomId),
        this.loadHousekeepingEvents(roomId),
        this.loadAssignments(roomId),
        canViewPhotos ? this.photosService()?.timeline(roomId) ?? Promise.resolve([]) : Promise.resolve([]),
        canViewDamages ? this.damageReports.list({ roomId }) : Promise.resolve([]),
        canViewLostFound ? this.lostFound.list({ roomId }) : Promise.resolve([]),
      ]);

    return {
      room: room as unknown as Record<string, unknown>,
      guestStays,
      inspections,
      housekeepingEvents,
      assignments,
      photos: photos.map((p) => ({
        id: p.id,
        url: p.url,
        mime: p.mime,
        takenAt: p.takenAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        roomInspectionId: p.roomInspectionId,
        inspection: p.inspection
          ? {
              id: p.inspection.id,
              passed: p.inspection.passed,
              notes: p.inspection.notes,
              inspectedAt: p.inspection.inspectedAt.toISOString(),
            }
          : null,
        uploadedBy: p.uploadedBy,
      })),
      damages: damages.map((d) => ({
        id: d.id,
        damageType: d.damageType,
        description: d.description,
        status: d.status,
        reportedAt: d.reportedAt.toISOString(),
        photoUrl: d.photoUrl ?? '',
        reportedBy: d.reportedBy,
      })),
      lostFound: lostFound.map((item) => ({
        id: item.id,
        description: item.description,
        status: item.status,
        foundAt: item.foundAt?.toISOString() ?? null,
        storedAt: item.storedAt?.toISOString() ?? null,
        storedLocation: item.storedLocation,
        createdAt: item.createdAt.toISOString(),
        photoUrl: item.photoUrl,
        reportedBy: item.reportedBy,
      })),
    };
  }

  private hasPermission(viewer: AuthenticatedUser, code: PermissionCode): boolean {
    if (viewer.role === UserRole.ADMIN) return true;
    return viewer.effectivePermissions?.includes(code) ?? false;
  }

  private async loadGuestStays(roomNumber: string, from?: string, to?: string) {
    const hid = process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const today = hotelTodayIso();
    const normalized = normalizeEmmaRoomNumber(roomNumber);

    const archived = await this.prisma.roomGuestStay.findMany({
      where: {
        hotelId: hid,
        roomNumber: normalized,
      },
      orderBy: [{ departureDate: 'desc' }, { arrivalDate: 'desc' }, { checkInAt: 'desc' }],
    });

    const archivedRows = archived
      .filter((stay) =>
        matchesGuestStayDateRange(stay.arrivalDate, stay.departureDate, from, to),
      )
      .map((stay) => this.mapGuestStayRow(stay, today));

    const archivedReservationIds = new Set(archivedRows.map((row) => row.reservationId));

    const snapshots = await this.prisma.reservationSnapshot.findMany({
      where: {
        hotelId: hid,
        checkIn: true,
        roomId: { not: null },
      },
      orderBy: [{ departureDate: 'desc' }, { arrivalDate: 'desc' }],
    });

    const fallbackRows = snapshots
      .filter(
        (snap) =>
          !archivedReservationIds.has(snap.reservationId) &&
          matchesGuestStayForRoom(snap.roomId, roomNumber) &&
          matchesGuestStayDateRange(snap.arrivalDate, snap.departureDate, from, to),
      )
      .map((snap) => {
        const sensitive = decryptSensitivePayload(this.cipher, snap.sensitiveEnc);
        return {
          id: `snapshot-${snap.id}`,
          reservationId: snap.reservationId,
          mainGuestName: sensitive?.mainGuestName ?? null,
          arrivalDate: snap.arrivalDate.toISOString().slice(0, 10),
          departureDate: snap.departureDate.toISOString().slice(0, 10),
          checkOut: snap.checkOut,
          presence: guestStayPresence(snap.departureDate, snap.checkOut, today),
          stayover: sensitive?.stayover ?? false,
          expectedDepartureTime: sensitive?.expectedDepartureTime ?? null,
          checkInAt: null,
          source: 'in_house' as const,
        };
      });

    return [...archivedRows, ...fallbackRows];
  }

  private mapGuestStayRow(
    stay: {
      id: string;
      reservationId: string;
      mainGuestNameEnc: string;
      arrivalDate: Date;
      departureDate: Date;
      checkedOut: boolean;
      stayover: boolean;
      expectedDepartureTime: string | null;
      checkInAt: Date | null;
      source: RoomGuestStaySource;
    },
    today: string,
  ) {
    const sensitive = decryptSensitivePayload(this.cipher, stay.mainGuestNameEnc);
    return {
      id: stay.id,
      reservationId: stay.reservationId,
      mainGuestName: sensitive?.mainGuestName ?? null,
      arrivalDate: stay.arrivalDate.toISOString().slice(0, 10),
      departureDate: stay.departureDate.toISOString().slice(0, 10),
      checkOut: stay.checkedOut,
      presence: guestStayPresence(stay.departureDate, stay.checkedOut, today),
      stayover: stay.stayover,
      expectedDepartureTime: stay.expectedDepartureTime,
      checkInAt: stay.checkInAt?.toISOString() ?? null,
      source: this.mapGuestStaySource(stay.source),
    };
  }

  private mapGuestStaySource(source: RoomGuestStaySource): 'check_ins_done' | 'in_house' | 'backfill' {
    switch (source) {
      case RoomGuestStaySource.CHECK_INS_DONE:
        return 'check_ins_done';
      case RoomGuestStaySource.BACKFILL:
        return 'backfill';
      default:
        return 'in_house';
    }
  }

  private async loadInspections(roomId: string) {
    const rows = await this.prisma.roomInspection.findMany({
      where: { roomId },
      include: { inspector: { select: userPublicSelect } },
      orderBy: { inspectedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      inspectedAt: row.inspectedAt.toISOString(),
      passed: row.passed,
      notes: row.notes,
      inspector: row.inspector,
    }));
  }

  private async loadHousekeepingEvents(roomId: string) {
    const rows = await this.prisma.roomHousekeepingEvent.findMany({
      where: { roomId },
      include: { user: { select: userPublicSelect } },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      occurredAt: row.occurredAt.toISOString(),
      user: row.user,
    }));
  }

  private async loadAssignments(roomId: string) {
    const rows = await this.prisma.roomAssignment.findMany({
      where: { roomId },
      include: {
        housekeeper: { select: userPublicSelect },
        assigner: { select: userPublicSelect },
      },
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      assignedAt: row.assignedAt.toISOString(),
      status: row.status,
      housekeeper: row.housekeeper,
      assigner: row.assigner,
    }));
  }
}
