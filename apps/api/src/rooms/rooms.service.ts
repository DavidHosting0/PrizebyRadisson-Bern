import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  ChecklistTaskStatus,
  PhotoUploadStatus,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomStatusService } from './room-status.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { S3Service } from '../storage/s3.service';
import { compareRoomNumbers, floorFromRoomNumber } from './room-layout';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomStatus: RoomStatusService,
    private readonly realtime: RealtimeGateway,
    private readonly s3: S3Service,
  ) {}

  async findAll(
    user: User,
    query: { floor?: number; status?: string; mine?: boolean },
  ) {
    const where: Prisma.RoomWhereInput = {};
    if (query.floor != null) where.floor = query.floor;

    if (query.mine && user.role === UserRole.HOUSEKEEPER) {
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

    return rooms.map((r) => this.toRoomDto(r));
  }

  async findOne(id: string) {
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
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    let lastCleaningPhoto: {
      id: string;
      url: string | null;
      takenAt: Date | null;
      createdAt: Date;
      uploadedBy: { id: string; name: string };
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
      by: { id: string; name: string };
      at: Date;
      source: 'cleaning_photo' | 'cleaning_session' | 'inspection';
    } | null = null;

    if (lastPhotoRow) {
      lastCleaning = {
        by: lastPhotoRow.uploadedBy,
        at: lastPhotoRow.takenAt ?? lastPhotoRow.createdAt,
        source: 'cleaning_photo',
      };
    } else {
      const session = await this.prisma.cleaningSession.findFirst({
        where: { roomId: id, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        include: { assignedUser: { select: { id: true, name: true } } },
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
          include: { inspector: { select: { id: true, name: true } } },
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

    return { ...base, lastCleaningPhoto, lastCleaning };
  }

  private toRoomDto(room: {
    id: string;
    roomNumber: string;
    floor: number | null;
    outOfOrder: boolean;
    oooReason: string | null;
    oooUntil: Date | null;
    notes: string | null;
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
    const derived = this.roomStatus.derive(room, tasks, room.inspections);
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
      roomType: room.roomType,
      derivedStatus: derived,
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
}
