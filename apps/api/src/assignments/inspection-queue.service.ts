import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  hotelTodayIso,
  type DailyCleaningAssignee,
  type InspectionQueueResponse,
  type InspectionQueueTaskDto,
} from '@housekeeping/shared';
import {
  DailyInspectionTaskStatus,
  User,
  UserRole,
  UserTitlePrefix,
} from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnlyFromIso } from './assignment-balancer';

@Injectable()
export class InspectionQueueService {
  constructor(private readonly prisma: PrismaService) {}

  /** Housekeeping staff for inspector picker — not HTC / HTC in training. */
  async listInspectorCandidates(): Promise<DailyCleaningAssignee[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        titlePrefix: { notIn: [UserTitlePrefix.HTC, UserTitlePrefix.HTC_IN_TRAINING] },
        OR: [
          { role: UserRole.HOUSEKEEPER, titlePrefix: UserTitlePrefix.CLEANER },
          { role: UserRole.SUPERVISOR },
          { titlePrefix: UserTitlePrefix.HOUSEKEEPING_SUPERVISOR },
        ],
      },
      select: { id: true, name: true, titlePrefix: true, role: true },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      titlePrefix: u.titlePrefix,
      role: u.role,
      isLateShift: false,
      lateShiftSource: 'none' as const,
    }));
  }

  async listInspectorsForDate(dateIso: string): Promise<DailyCleaningAssignee[]> {
    const duties = await this.prisma.dailyInspectionDuty.findMany({
      where: { date: dateOnlyFromIso(dateIso) },
      include: { user: { select: { id: true, name: true, titlePrefix: true, role: true } } },
    });
    return duties.map((d) => ({
      id: d.user.id,
      name: d.user.name,
      titlePrefix: d.user.titlePrefix,
      role: d.user.role,
      isLateShift: false,
      lateShiftSource: 'none' as const,
    }));
  }

  async setInspectorsForDate(dateIso: string, userIds: string[]) {
    const date = dateOnlyFromIso(dateIso);
    const unique = [...new Set(userIds.filter(Boolean))];
    const candidates = await this.listInspectorCandidates();
    const allowed = new Set(candidates.map((c) => c.id));
    for (const id of unique) {
      if (!allowed.has(id)) {
        throw new ForbiddenException(`User ${id} is not eligible as inspector`);
      }
    }
    await this.prisma.$transaction([
      this.prisma.dailyInspectionDuty.deleteMany({ where: { date } }),
      ...(unique.length
        ? [
            this.prisma.dailyInspectionDuty.createMany({
              data: unique.map((userId) => ({ date, userId })),
            }),
          ]
        : []),
    ]);
  }

  async hasDutyToday(userId: string, dateIso = hotelTodayIso()): Promise<boolean> {
    const row = await this.prisma.dailyInspectionDuty.findUnique({
      where: {
        date_userId: { date: dateOnlyFromIso(dateIso), userId },
      },
    });
    return !!row;
  }

  async enqueueAfterMarkClean(roomId: string, dateIso = hotelTodayIso()) {
    const date = dateOnlyFromIso(dateIso);
    const dutyCount = await this.prisma.dailyInspectionDuty.count({ where: { date } });
    if (dutyCount === 0) return null;

    return this.prisma.dailyInspectionTask.upsert({
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

  /**
   * Ensure CLEAN / overnight-INSPECTED rooms appear on today's shared inspection queue
   * when inspectors are on duty (without resetting CLAIMED/DONE).
   */
  async ensurePendingForRooms(roomIds: string[], dateIso = hotelTodayIso()) {
    const date = dateOnlyFromIso(dateIso);
    const dutyCount = await this.prisma.dailyInspectionDuty.count({ where: { date } });
    if (dutyCount === 0 || roomIds.length === 0) return;

    for (const roomId of roomIds) {
      const existing = await this.prisma.dailyInspectionTask.findUnique({
        where: { date_roomId: { date, roomId } },
      });
      if (
        existing &&
        (existing.status === DailyInspectionTaskStatus.PENDING ||
          existing.status === DailyInspectionTaskStatus.CLAIMED ||
          existing.status === DailyInspectionTaskStatus.DONE)
      ) {
        continue;
      }
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
  }

  async cancelOpenTaskForRoom(roomId: string, dateIso = hotelTodayIso()) {
    await this.prisma.dailyInspectionTask.updateMany({
      where: {
        roomId,
        date: dateOnlyFromIso(dateIso),
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
  }

  async listQueueForUser(user: User, date?: string): Promise<InspectionQueueResponse> {
    const dateIso = date?.trim() || hotelTodayIso();
    const onDuty = await this.hasDutyToday(user.id, dateIso);
    const duties = await this.listInspectorsForDate(dateIso);
    if (!onDuty && user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      return { date: dateIso, onDuty: false, duties, tasks: [] };
    }

    const rows = await this.prisma.dailyInspectionTask.findMany({
      where: {
        date: dateOnlyFromIso(dateIso),
        status: {
          in: [DailyInspectionTaskStatus.PENDING, DailyInspectionTaskStatus.CLAIMED],
        },
      },
      include: {
        room: { select: { id: true, roomNumber: true, floor: true } },
        claimedBy: { select: userPublicSelect },
      },
      orderBy: { createdAt: 'asc' },
    });

    const tasks: InspectionQueueTaskDto[] = rows.map((r) => ({
      id: r.id,
      date: dateIso,
      roomId: r.roomId,
      roomNumber: r.room.roomNumber,
      floor: r.room.floor,
      status: r.status,
      claimedByUserId: r.claimedByUserId,
      claimedByName: r.claimedBy?.name ?? null,
      claimedAt: r.claimedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return { date: dateIso, onDuty: onDuty || user.role === UserRole.SUPERVISOR || user.role === UserRole.ADMIN, duties, tasks };
  }

  async claim(taskId: string, user: User) {
    const onDuty = await this.hasDutyToday(user.id);
    if (!onDuty && user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Not on inspection duty today');
    }

    const updated = await this.prisma.dailyInspectionTask.updateMany({
      where: {
        id: taskId,
        status: DailyInspectionTaskStatus.PENDING,
        claimedByUserId: null,
      },
      data: {
        status: DailyInspectionTaskStatus.CLAIMED,
        claimedByUserId: user.id,
        claimedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      const existing = await this.prisma.dailyInspectionTask.findUnique({ where: { id: taskId } });
      if (!existing) throw new NotFoundException('Inspection task not found');
      throw new ConflictException('Already claimed');
    }
    return this.listQueueForUser(user);
  }

  async release(taskId: string, user: User) {
    const task = await this.prisma.dailyInspectionTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Inspection task not found');
    const isSupervisor = user.role === UserRole.SUPERVISOR || user.role === UserRole.ADMIN;
    if (task.claimedByUserId !== user.id && !isSupervisor) {
      throw new ForbiddenException();
    }
    await this.prisma.dailyInspectionTask.update({
      where: { id: taskId },
      data: {
        status: DailyInspectionTaskStatus.PENDING,
        claimedByUserId: null,
        claimedAt: null,
      },
    });
    return this.listQueueForUser(user);
  }

  async assertCanInspectRoom(user: User, roomId: string) {
    const isSupervisor = user.role === UserRole.SUPERVISOR || user.role === UserRole.ADMIN;
    const dateIso = hotelTodayIso();
    const task = await this.prisma.dailyInspectionTask.findUnique({
      where: { date_roomId: { date: dateOnlyFromIso(dateIso), roomId } },
    });

    if (task) {
      if (task.status === DailyInspectionTaskStatus.DONE) {
        throw new ForbiddenException('Inspection already completed');
      }
      if (task.status === DailyInspectionTaskStatus.CLAIMED && task.claimedByUserId === user.id) {
        return task;
      }
      if (isSupervisor && task.status === DailyInspectionTaskStatus.PENDING) {
        // Auto-claim for supervisor starting inspect from board
        await this.prisma.dailyInspectionTask.update({
          where: { id: task.id },
          data: {
            status: DailyInspectionTaskStatus.CLAIMED,
            claimedByUserId: user.id,
            claimedAt: new Date(),
          },
        });
        return this.prisma.dailyInspectionTask.findUniqueOrThrow({ where: { id: task.id } });
      }
      if (isSupervisor && task.claimedByUserId === user.id) return task;
      throw new ForbiddenException('Claim this inspection first');
    }

    // No duties / no task: supervisors retain legacy inspect-any-CLEAN behaviour
    if (isSupervisor) return null;

    const onDuty = await this.hasDutyToday(user.id, dateIso);
    if (!onDuty) throw new ForbiddenException();
    throw new ForbiddenException('No inspection task for this room');
  }

  async completeTaskForRoom(roomId: string, inspectionId: string, dateIso = hotelTodayIso()) {
    await this.prisma.dailyInspectionTask.updateMany({
      where: {
        roomId,
        date: dateOnlyFromIso(dateIso),
        status: {
          in: [DailyInspectionTaskStatus.PENDING, DailyInspectionTaskStatus.CLAIMED],
        },
      },
      data: {
        status: DailyInspectionTaskStatus.DONE,
        completedInspectionId: inspectionId,
      },
    });
  }

  async canUploadInspectionPhoto(user: User, roomId: string): Promise<boolean> {
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.ADMIN) return true;
    const dateIso = hotelTodayIso();
    if (!(await this.hasDutyToday(user.id, dateIso))) return false;
    const task = await this.prisma.dailyInspectionTask.findUnique({
      where: { date_roomId: { date: dateOnlyFromIso(dateIso), roomId } },
    });
    return !!task && task.status === DailyInspectionTaskStatus.CLAIMED && task.claimedByUserId === user.id;
  }
}
