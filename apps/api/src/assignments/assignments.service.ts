import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  AssignmentStatus,
  ChecklistTaskStatus,
  User,
  UserRole,
} from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class AssignmentsService implements OnModuleInit {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit() {
    const intervalMs = parseInt(process.env.AUTO_ASSIGN_INTERVAL_MS ?? '60000', 10);
    setInterval(() => {
      this.runAutoAssignment().catch((e) => this.logger.error(e));
    }, intervalMs);
  }

  async list() {
    return this.prisma.roomAssignment.findMany({
      where: { status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] } },
      include: {
        room: { select: { id: true, roomNumber: true, floor: true } },
        housekeeper: { select: userPublicSelect },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async manualAssign(roomId: string, housekeeperUserId: string, assigner: User) {
    if (assigner.role !== UserRole.SUPERVISOR && assigner.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    await this.prisma.roomAssignment.updateMany({
      where: { roomId, status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] } },
      data: { status: AssignmentStatus.CANCELLED },
    });
    const row = await this.prisma.roomAssignment.create({
      data: {
        roomId,
        housekeeperUserId,
        assignedByUserId: assigner.id,
        status: AssignmentStatus.ACTIVE,
      },
      include: {
        room: { select: { id: true, roomNumber: true } },
        housekeeper: { select: userPublicSelect },
      },
    });
    const room = await this.rooms.findOne(roomId);
    this.realtime.emitRoomStatus(room);
    return row;
  }

  async suggestions() {
    const dirtyRooms = await this.findDirtyUnassignedRooms();
    const hk = await this.prisma.user.findMany({
      where: { role: UserRole.HOUSEKEEPER, isActive: true },
      select: { id: true, name: true, titlePrefix: true },
    });
    const loads = await Promise.all(
      hk.map(async (u) => ({
        user: u,
        count: await this.prisma.roomAssignment.count({
          where: { housekeeperUserId: u.id, status: AssignmentStatus.ACTIVE },
        }),
      })),
    );
    loads.sort((a, b) => a.count - b.count);
    const suggestions = dirtyRooms.map((room, i) => ({
      roomId: room.id,
      roomNumber: room.roomNumber,
      suggestedHousekeeperId: loads[i % loads.length]?.user.id,
    }));
    return { dirtyRooms: dirtyRooms.length, suggestions };
  }

  async runAutoAssignment() {
    const now = new Date();
    const onShift = await this.prisma.shift.findMany({
      where: { startsAt: { lte: now }, endsAt: { gte: now } },
      select: { userId: true },
    });
    const shiftUserIds = new Set(onShift.map((s) => s.userId));
    const housekeepers = await this.prisma.user.findMany({
      where: { role: UserRole.HOUSEKEEPER, isActive: true },
      select: { id: true },
    });
    const eligible = housekeepers.filter((h) => shiftUserIds.size === 0 || shiftUserIds.has(h.id));
    if (!eligible.length) return { assigned: 0 };

    const dirtyRooms = await this.findDirtyUnassignedRooms();
    let assigned = 0;
    const loads = await Promise.all(
      eligible.map(async (u) => ({
        id: u.id,
        n: await this.prisma.roomAssignment.count({
          where: { housekeeperUserId: u.id, status: AssignmentStatus.ACTIVE },
        }),
      })),
    );
    loads.sort((a, b) => a.n - b.n);

    for (const room of dirtyRooms) {
      const pick = loads[0];
      if (!pick) break;
      await this.prisma.roomAssignment.create({
        data: {
          roomId: room.id,
          housekeeperUserId: pick.id,
          status: AssignmentStatus.ACTIVE,
        },
      });
      pick.n += 1;
      loads.sort((a, b) => a.n - b.n);
      assigned += 1;
      const r = await this.rooms.findOne(room.id);
      this.realtime.emitRoomStatus(r);
    }
    return { assigned };
  }

  private async findDirtyUnassignedRooms() {
    const rooms = await this.prisma.room.findMany({
      where: {
        outOfOrder: false,
        assignments: {
          none: { status: AssignmentStatus.ACTIVE },
        },
      },
      include: {
        checklistStates: {
          take: 1,
          include: { tasks: true },
        },
      },
    });
    return rooms.filter((r) => {
      const tasks = r.checklistStates[0]?.tasks ?? [];
      if (!tasks.length) return true;
      return tasks.some((t) => t.status !== ChecklistTaskStatus.COMPLETED);
    });
  }
}
