import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import {
  AssignmentStatus,
  ChecklistTaskStatus,
  DailyCleaningWorkType,
  DailyInspectionTaskStatus,
  PermissionCode,
  PhotoUploadStatus,
  Prisma,
  RoomHousekeepingEventKind,
  User,
  UserRole,
} from '@prisma/client';
import type { RoomOccupancy } from '@housekeeping/shared';
import { hotelTodayIso } from '@housekeeping/shared';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { RoomStatusService } from './room-status.service';
import { RoomOccupancyService } from './room-occupancy.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { S3Service } from '../storage/s3.service';
import { compareRoomNumbers, floorFromRoomNumber } from './room-layout';
import { EmmaService } from '../emma/emma.service';
import { readEmmaMetadata } from '../emma/emma-room-status-sync';
import {
  emmaCodeToDerivedStatus,
  formatEmmaRoomId,
  mapDerivedStatusToEmmaCode,
  type EmmaRoomStatusPushTarget,
} from '../emma/emma-room-status-push';
import { ReservationsService } from '../reservations/reservations.service';
import { dateOnlyFromIso } from '../assignments/assignment-balancer';
import type { SettableRoomStatus } from './dto/set-room-status.dto';

type RoomViewer = User & { effectivePermissions?: PermissionCode[] };

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomStatus: RoomStatusService,
    private readonly occupancy: RoomOccupancyService,
    private readonly realtime: RealtimeGateway,
    private readonly s3: S3Service,
    @Optional()
    @Inject(forwardRef(() => EmmaService))
    private readonly emma?: EmmaService,
    @Optional()
    @Inject(forwardRef(() => ReservationsService))
    private readonly reservations?: ReservationsService,
  ) {}

  private emmaAfterRoomActivity(source: string) {
    this.emma?.scheduleRoomStatusSync(source);
  }

  private emmaOnRoomsViewed(source: string, viewer?: RoomViewer) {
    this.emma?.scheduleRoomStatusSyncOnView(source);
    if (this.canViewOccupancy(viewer)) {
      this.reservations?.scheduleSyncOnView(source);
    }
  }

  async findAll(
    user: RoomViewer,
    query: { floor?: number; status?: string; mine?: boolean },
  ) {
    this.emmaOnRoomsViewed(
      query.mine ? 'rooms.list.mine' : query.floor != null ? 'rooms.list.floor' : 'rooms.list',
      user,
    );
    const where: Prisma.RoomWhereInput = {};
    if (query.floor != null) where.floor = query.floor;

    if (query.mine && (user.role === UserRole.HOUSEKEEPER || user.role === UserRole.SUPERVISOR)) {
      where.assignments = {
        some: {
          housekeeperUserId: user.id,
          status: AssignmentStatus.ACTIVE,
        },
      };
    }

    const rooms = await this.prisma.room.findMany({
      where,
      include: {
        roomType: true,
        checklistStates: {
          take: 1,
          include: {
            tasks: { include: { templateTask: true } },
          },
        },
        inspections: { orderBy: { inspectedAt: 'desc' }, take: 3 },
      },
      orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
    });

    rooms.sort((a, b) => {
      const fa = a.floor ?? floorFromRoomNumber(a.roomNumber) ?? Number.POSITIVE_INFINITY;
      const fb = b.floor ?? floorFromRoomNumber(b.roomNumber) ?? Number.POSITIVE_INFINITY;
      if (fa !== fb) return fa - fb;
      return compareRoomNumbers(a.roomNumber, b.roomNumber);
    });

    const dtos = rooms.map((r) => this.toRoomDto(r));
    const withOccupancy = await this.attachOccupancy(dtos, user);
    return this.attachLastPhotoThumbs(withOccupancy, user);
  }

  async findOne(id: string, viewer?: RoomViewer) {
    this.emmaOnRoomsViewed('rooms.detail', viewer);
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        roomType: true,
        checklistStates: {
          take: 1,
          include: {
            tasks: { include: { templateTask: true }, orderBy: { templateTask: { sortOrder: 'asc' } } },
          },
        },
        inspections: { orderBy: { inspectedAt: 'desc' }, take: 5 },
      },
    });
    if (!room) throw new NotFoundException('Room not found');
    const base = this.toRoomDto(room);

    const lastPhotoRow = await this.prisma.roomPhoto.findFirst({
      where: { roomId: id, status: PhotoUploadStatus.READY },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: userPublicSelect } },
    });

    let lastCleaningPhoto: {
      id: string;
      url: string | null;
      takenAt: Date | null;
      createdAt: Date;
      uploadedBy: { id: string; name: string; titlePrefix: string };
    } | null = null;

    if (lastPhotoRow) {
      let url: string | null = null;
      try {
        url = (await this.s3.presignGet(lastPhotoRow.s3Key)).url;
      } catch {
        url = null;
      }
      lastCleaningPhoto = {
        id: lastPhotoRow.id,
        url,
        takenAt: lastPhotoRow.takenAt,
        createdAt: lastPhotoRow.createdAt,
        uploadedBy: lastPhotoRow.uploadedBy,
      };
    }

    let lastCleaning: {
      by: { id: string; name: string; titlePrefix: string };
      at: Date;
      source: 'inspection_photo' | 'housekeeper_declared' | 'cleaning_session' | 'inspection';
    } | null = null;

    if (lastPhotoRow?.roomInspectionId) {
      lastCleaning = {
        by: lastPhotoRow.uploadedBy,
        at: lastPhotoRow.takenAt ?? lastPhotoRow.createdAt,
        source: 'inspection_photo',
      };
    } else if (room.cleaningDeclaredAt) {
      const assignment = await this.prisma.roomAssignment.findFirst({
        where: { roomId: id, status: AssignmentStatus.ACTIVE },
        orderBy: { assignedAt: 'desc' },
        include: { housekeeper: { select: userPublicSelect } },
      });
      if (assignment) {
        lastCleaning = {
          by: assignment.housekeeper,
          at: room.cleaningDeclaredAt,
          source: 'housekeeper_declared',
        };
      }
    } else if (lastPhotoRow) {
      lastCleaning = {
        by: lastPhotoRow.uploadedBy,
        at: lastPhotoRow.takenAt ?? lastPhotoRow.createdAt,
        source: 'inspection_photo',
      };
    } else {
      const session = await this.prisma.cleaningSession.findFirst({
        where: { roomId: id, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        include: { assignedUser: { select: userPublicSelect } },
      });
      if (session?.completedAt) {
        lastCleaning = {
          by: session.assignedUser,
          at: session.completedAt,
          source: 'cleaning_session',
        };
      } else {
        const insp = await this.prisma.roomInspection.findFirst({
          where: { roomId: id, passed: true },
          orderBy: { inspectedAt: 'desc' },
          include: { inspector: { select: userPublicSelect } },
        });
        if (insp) {
          lastCleaning = {
            by: insp.inspector,
            at: insp.inspectedAt,
            source: 'inspection',
          };
        }
      }
    }

    return this.attachOccupancy([{ ...base, lastCleaningPhoto, lastCleaning }], viewer).then(
      (rows) => rows[0]!,
    );
  }

  async markHousekeepingClean(roomId: string, user: RoomViewer) {
    if (user.role !== UserRole.HOUSEKEEPER && user.role !== UserRole.SUPERVISOR) {
      throw new ForbiddenException('Only assigned cleaning staff can mark a room clean');
    }
    const a = await this.prisma.roomAssignment.findFirst({
      where: {
        roomId,
        housekeeperUserId: user.id,
        status: AssignmentStatus.ACTIVE,
      },
    });
    if (!a) throw new ForbiddenException('Not assigned to this room');

    const cleaningDeclaredAt = new Date();
    const today = hotelTodayIso();
    const date = dateOnlyFromIso(today);

    const restantOpen = await this.prisma.dailyCleaningTask.findFirst({
      where: {
        roomId,
        completedAt: null,
        workType: DailyCleaningWorkType.RESTANT,
        plan: { date },
      },
      select: { id: true },
    });
    if (restantOpen) {
      throw new BadRequestException(
        'Restant rooms are finished via the task list, not mark-clean',
      );
    }

    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: roomId },
        data: { cleaningDeclaredAt },
      }),
      this.prisma.roomHousekeepingEvent.create({
        data: {
          roomId,
          userId: user.id,
          kind: RoomHousekeepingEventKind.MARKED_CLEAN,
        },
      }),
      this.prisma.roomCleaningDeferral.updateMany({
        where: { roomId, clearedAt: null },
        data: { clearedAt: cleaningDeclaredAt },
      }),
      this.prisma.dailyCleaningTask.updateMany({
        where: {
          roomId,
          completedAt: null,
          workType: DailyCleaningWorkType.DIRTY,
          plan: { date },
        },
        data: { completedAt: cleaningDeclaredAt },
      }),
    ]);

    // Local CLEAN only — Emma gets INSPECTED after a passed inspection.
    const duties = await this.prisma.dailyInspectionDuty.count({ where: { date } });
    if (duties > 0) {
      await this.prisma.dailyInspectionTask.upsert({
        where: { date_roomId: { date, roomId } },
        create: {
          date,
          roomId,
          status: DailyInspectionTaskStatus.PENDING,
        },
        update: {
          status: DailyInspectionTaskStatus.PENDING,
          claimedByUserId: null,
          claimedAt: null,
          completedInspectionId: null,
        },
      });
    }

    const out = await this.findOne(roomId, user);
    this.realtime.emitRoomStatus(out);
    return out;
  }

  /**
   * Front Office / Reception (and others with ROOM_STATUS_WRITE): set Dirty / Clean / Inspected
   * locally and push the matching EMMA code (DI / CL / IN).
   */
  async setRoomStatus(roomId: string, status: SettableRoomStatus, user: RoomViewer) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, roomNumber: true, outOfOrder: true, metadata: true, cleaningDeclaredAt: true },
    });
    if (!room) throw new NotFoundException('Room');
    if (room.outOfOrder) {
      throw new BadRequestException('Cannot change status while the room is out of order');
    }

    const actionAt = new Date();
    const today = dateOnlyFromIso(hotelTodayIso());
    const target = status as EmmaRoomStatusPushTarget;

    await this.prisma.$transaction(async (tx) => {
      if (status === 'CLEAN') {
        await tx.room.update({
          where: { id: roomId },
          data: { cleaningDeclaredAt: actionAt },
        });
        await tx.roomCleaningDeferral.updateMany({
          where: { roomId, clearedAt: null },
          data: { clearedAt: actionAt },
        });
      } else if (status === 'DIRTY') {
        await tx.room.update({
          where: { id: roomId },
          data: { cleaningDeclaredAt: null },
        });
        await tx.dailyInspectionTask.updateMany({
          where: {
            roomId,
            date: today,
            status: {
              in: [DailyInspectionTaskStatus.PENDING, DailyInspectionTaskStatus.CLAIMED],
            },
          },
          data: {
            status: DailyInspectionTaskStatus.CANCELLED,
            claimedByUserId: null,
            claimedAt: null,
          },
        });
      } else {
        // INSPECTED — keep cleaningDeclaredAt so local history stays coherent; EMMA metadata wins.
        await tx.room.update({
          where: { id: roomId },
          data: {
            cleaningDeclaredAt: room.cleaningDeclaredAt ?? actionAt,
            departureStickyOn: null,
          },
        });
        await tx.dailyInspectionTask.updateMany({
          where: {
            roomId,
            date: today,
            status: {
              in: [DailyInspectionTaskStatus.PENDING, DailyInspectionTaskStatus.CLAIMED],
            },
          },
          data: {
            status: DailyInspectionTaskStatus.DONE,
            claimedByUserId: null,
            claimedAt: null,
          },
        });
      }
    });

    const pushResult = await this.emma?.pushRoomStatus(roomId, target, {
      actionAt,
      source: `rooms.setStatus.${status.toLowerCase()}`,
    });

    // Board must match FO intent if EMMA push is off, failed, or skipped (outbox retries on failure).
    if (!pushResult || !pushResult.ok || pushResult.skipped) {
      await this.ensureLocalEmmaBoardStatus(
        roomId,
        target,
        actionAt,
        user.id,
        'rooms.setStatus.local',
      );
    }

    const out = await this.findOne(roomId, user);
    this.realtime.emitRoomStatus(out);
    return out;
  }

  /**
   * Persist EMMA-shaped metadata so derive() shows the intended status immediately
   * (FO set-status and passed inspections), even when the live Emma MERGE is off/failed.
   */
  async ensureLocalEmmaBoardStatus(
    roomId: string,
    target: EmmaRoomStatusPushTarget,
    actionAt: Date,
    userId: string,
    source = 'rooms.localEmmaOverride',
  ) {
    const code = mapDerivedStatusToEmmaCode(target);
    if (!code) return;

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { roomNumber: true, metadata: true },
    });
    if (!room) return;

    const emmaMeta = readEmmaMetadata(room.metadata);
    if (emmaMeta?.statusCode === code) {
      const syncedAtMs = emmaMeta.syncedAt ? new Date(emmaMeta.syncedAt).getTime() : 0;
      if (syncedAtMs >= actionAt.getTime()) return;
    }

    const emmaRoomId = formatEmmaRoomId(room.roomNumber, emmaMeta?.roomId);
    const syncedAt = actionAt.toISOString();
    const prevMeta =
      room.metadata && typeof room.metadata === 'object' && !Array.isArray(room.metadata)
        ? (room.metadata as Record<string, unknown>)
        : {};
    const prevEmma = emmaMeta ?? {
      roomId: emmaRoomId,
      statusCode: null,
      statusLabel: null,
      derivedStatus: null,
      outOfOrder: false,
      floorId: null,
      buildingId: '01',
      syncedAt: '',
    };
    const nextMeta = {
      ...prevMeta,
      emma: {
        ...prevEmma,
        roomId: emmaRoomId,
        statusCode: code,
        derivedStatus: emmaCodeToDerivedStatus(code),
        syncedAt,
      },
      emmaPush: {
        lastPushAt: syncedAt,
        lastPushCode: code,
        lastPushOk: false,
        source,
        setByUserId: userId,
      },
    };
    await this.prisma.room.update({
      where: { id: roomId },
      data: { metadata: nextMeta as Prisma.InputJsonValue },
    });
  }

  private toRoomDto(room: {
    id: string;
    roomNumber: string;
    floor: number | null;
    outOfOrder: boolean;
    oooReason: string | null;
    oooUntil: Date | null;
    notes: string | null;
    cleaningDeclaredAt: Date | null;
    metadata?: unknown;
    roomType: { name: string; code: string };
    checklistStates: Array<{
      id: string;
      tasks: Array<{
        id: string;
        status: ChecklistTaskStatus;
        supervisorOverride: boolean;
        updatedAt: Date;
        templateTask: { id: string; label: string; code: string; required: boolean };
      }>;
    }>;
    inspections: Array<{ passed: boolean; inspectedAt: Date }>;
  }) {
    const state = room.checklistStates[0];
    const tasks = state?.tasks ?? [];
    const emmaMeta = readEmmaMetadata(room.metadata);
    const derived = this.roomStatus.derive(room, tasks, room.inspections, emmaMeta);
    const floor =
      room.floor ?? floorFromRoomNumber(room.roomNumber) ?? null;
    return {
      id: room.id,
      roomNumber: room.roomNumber,
      floor,
      outOfOrder: room.outOfOrder,
      oooReason: room.oooReason,
      oooUntil: room.oooUntil,
      notes: room.notes,
      cleaningDeclaredAt: room.cleaningDeclaredAt,
      roomType: room.roomType,
      derivedStatus: derived,
      emma: emmaMeta
        ? {
            statusCode: emmaMeta.statusCode,
            statusLabel: emmaMeta.statusLabel,
            derivedStatus: emmaMeta.derivedStatus,
            syncedAt: emmaMeta.syncedAt,
          }
        : null,
      checklist: state
        ? {
            stateId: state.id,
            tasks: tasks.map((t) => ({
              id: t.id,
              status: t.status,
              supervisorOverride: t.supervisorOverride,
              updatedAt: t.updatedAt,
              label: t.templateTask.label,
              code: t.templateTask.code,
              required: t.templateTask.required,
            })),
          }
        : null,
    };
  }

  async updateRoom(
    id: string,
    dto: {
      outOfOrder?: boolean;
      oooReason?: string | null;
      oooUntil?: string | Date | null;
      notes?: string | null;
    },
  ) {
    const room = await this.prisma.room.update({
      where: { id },
      data: {
        outOfOrder: dto.outOfOrder,
        oooReason: dto.oooReason,
        oooUntil: dto.oooUntil != null ? new Date(dto.oooUntil) : dto.oooUntil,
        notes: dto.notes,
      },
      include: {
        roomType: true,
        checklistStates: {
          take: 1,
          include: {
            tasks: { include: { templateTask: true } },
          },
        },
        inspections: { orderBy: { inspectedAt: 'desc' }, take: 5 },
      },
    });
    const dtoOut = this.toRoomDto(room);
    this.realtime.emitRoomStatus(dtoOut);
    this.emmaAfterRoomActivity('rooms.updateRoom');
    return dtoOut;
  }

  async ensureChecklistState(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { roomType: true },
    });
    if (!room) throw new NotFoundException('Room');
    const templateId =
      room.roomType.defaultChecklistTemplateId ??
      (await this.prisma.checklistTemplate.findFirst({
        where: { roomTypeId: room.roomTypeId },
        orderBy: { version: 'desc' },
      }))?.id;
    if (!templateId) return null;

    let state = await this.prisma.roomChecklistState.findUnique({ where: { roomId } });
    if (state) return state;

    const templateTasks = await this.prisma.checklistTemplateTask.findMany({
      where: { templateId },
      orderBy: { sortOrder: 'asc' },
    });

    state = await this.prisma.roomChecklistState.create({
      data: {
        roomId,
        templateId,
        tasks: {
          create: templateTasks.map((tt) => ({
            templateTaskId: tt.id,
            status: ChecklistTaskStatus.NOT_STARTED,
          })),
        },
      },
    });
    return state;
  }

  private canViewPhotoTimeline(viewer?: RoomViewer): boolean {
    if (!viewer) return false;
    if (viewer.role === UserRole.ADMIN) return true;
    return viewer.effectivePermissions?.includes(PermissionCode.PHOTO_TIMELINE_READ) ?? false;
  }

  private async attachLastPhotoThumbs<T extends { id: string }>(
    dtos: T[],
    viewer?: RoomViewer,
  ): Promise<(T & { lastPhotoUrl: string | null; lastPhotoAt: string | null })[]> {
    const empty = dtos.map((d) => ({ ...d, lastPhotoUrl: null, lastPhotoAt: null }));
    if (!this.canViewPhotoTimeline(viewer) || dtos.length === 0) return empty;

    const roomIds = dtos.map((d) => d.id);
    const photos = await this.prisma.roomPhoto.findMany({
      where: { roomId: { in: roomIds }, status: PhotoUploadStatus.READY },
      orderBy: { createdAt: 'desc' },
      select: { roomId: true, s3Key: true, createdAt: true, takenAt: true },
    });

    const latest = new Map<string, (typeof photos)[0]>();
    for (const p of photos) {
      if (!latest.has(p.roomId)) latest.set(p.roomId, p);
    }

    const thumbByRoom = new Map<string, { url: string | null; at: string }>();
    await Promise.all(
      Array.from(latest.entries()).map(async ([roomId, row]) => {
        let url: string | null = null;
        try {
          url = (await this.s3.presignGet(row.s3Key)).url;
        } catch {
          url = null;
        }
        const at = (row.takenAt ?? row.createdAt).toISOString();
        thumbByRoom.set(roomId, { url, at });
      }),
    );

    return dtos.map((d) => {
      const thumb = thumbByRoom.get(d.id);
      return {
        ...d,
        lastPhotoUrl: thumb?.url ?? null,
        lastPhotoAt: thumb?.at ?? null,
      };
    });
  }

  private canViewOccupancy(viewer?: RoomViewer): boolean {
    if (!viewer) return false;
    if (viewer.effectivePermissions?.includes(PermissionCode.RESERVATIONS_READ)) return true;
    return (
      viewer.role === UserRole.TECHNICIAN &&
      (viewer.effectivePermissions?.includes(PermissionCode.ROOMS_READ) ?? false)
    );
  }

  private async attachOccupancy<
    T extends { id: string; roomNumber: string; derivedStatus: string },
  >(dtos: T[], viewer?: RoomViewer): Promise<(T & { occupancy?: RoomOccupancy | null })[]> {
    if (!this.canViewOccupancy(viewer) || dtos.length === 0) return dtos;
    const map = await this.occupancy.mapForRoomNumbers(dtos.map((d) => d.roomNumber));

    const stickyRows = await this.prisma.room.findMany({
      where: { id: { in: dtos.map((d) => d.id) } },
      select: { id: true, departureStickyOn: true },
    });
    const stickyById = new Map(stickyRows.map((r) => [r.id, r.departureStickyOn]));

    const withOcc = dtos.map((d) => ({
      ...d,
      occupancy: map.get(d.roomNumber) ?? null,
      departureStickyOn: stickyById.get(d.id) ?? null,
    }));

    const stickyToday = await this.occupancy.syncDepartureSticky(withOcc);

    return dtos.map((d) => ({
      ...d,
      occupancy: this.occupancy.applyStickyDeparture(
        map.get(d.roomNumber) ?? null,
        stickyToday.get(d.id) === true,
      ),
    }));
  }
}
