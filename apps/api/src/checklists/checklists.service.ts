import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  ChecklistTaskStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UpdateChecklistTaskDto } from './dto/update-checklist-task.dto';

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async assertCanEditRoom(user: User, roomId: string) {
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.ADMIN) return;
    if (user.role === UserRole.RECEPTION) {
      throw new ForbiddenException();
    }
    if (user.role === UserRole.HOUSEKEEPER) {
      const a = await this.prisma.roomAssignment.findFirst({
        where: {
          roomId,
          housekeeperUserId: user.id,
          status: AssignmentStatus.ACTIVE,
        },
      });
      if (!a) throw new ForbiddenException('Not assigned to this room');
    }
  }

  async updateTask(roomId: string, taskId: string, user: User, dto: UpdateChecklistTaskDto) {
    await this.rooms.ensureChecklistState(roomId);
    await this.assertCanEditRoom(user, roomId);

    const task = await this.prisma.roomChecklistTask.findFirst({
      where: { id: taskId, state: { roomId } },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (dto.supervisorOverride && user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Supervisor override only');
    }

    await this.prisma.roomChecklistTask.update({
      where: { id: task.id },
      data: {
        status: dto.status,
        updatedByUserId: user.id,
        supervisorOverride: dto.supervisorOverride ?? false,
      },
    });

    if (dto.status !== ChecklistTaskStatus.COMPLETED) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { cleaningDeclaredAt: null },
      });
    }

    const room = await this.rooms.findOne(roomId, user);
    this.realtime.emitChecklistTask({ roomId, taskId });
    this.realtime.emitRoomStatus(room);
    return room;
  }

  async reopen(roomId: string, user: User) {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    await this.rooms.ensureChecklistState(roomId);
    const state = await this.prisma.roomChecklistState.findUnique({
      where: { roomId },
      include: { tasks: true },
    });
    if (!state) throw new NotFoundException();

    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: roomId },
        data: { cleaningDeclaredAt: null },
      }),
      ...state.tasks.map((t) =>
        this.prisma.roomChecklistTask.update({
          where: { id: t.id },
          data: {
            status: ChecklistTaskStatus.NOT_STARTED,
            supervisorOverride: true,
            updatedByUserId: user.id,
          },
        }),
      ),
    ]);

    const room = await this.rooms.findOne(roomId, user);
    this.realtime.emitRoomStatus(room);
    return room;
  }
}
