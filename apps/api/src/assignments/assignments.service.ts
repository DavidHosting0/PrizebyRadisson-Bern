import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common';
import type { AssignmentSuggestionsResponse, RunAutoAssignResponse } from '@housekeeping/shared';
import { AssignmentStatus, User, UserRole } from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmmaService } from '../emma/emma.service';
import { DailyCleaningService } from './daily-cleaning.service';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
    private readonly daily: DailyCleaningService,
    @Optional()
    @Inject(forwardRef(() => EmmaService))
    private readonly emma?: EmmaService,
  ) {}

  async list() {
    return this.prisma.roomAssignment.findMany({
      where: {
        status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] },
        housekeeper: { isActive: true },
      },
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
    const housekeeper = await this.prisma.user.findFirst({
      where: {
        id: housekeeperUserId,
        isActive: true,
        OR: [
          { role: UserRole.HOUSEKEEPER },
          { role: UserRole.SUPERVISOR },
          { role: UserRole.ADMIN },
        ],
      },
      select: { id: true },
    });
    if (!housekeeper) {
      throw new BadRequestException('Assignee not found or inactive');
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

    // Keep daily plan in sync when board drag-drops
    try {
      const dateIso = this.daily.resolveDate();
      await this.daily.syncWorkItems(dateIso);
      const plan = await this.prisma.dailyCleaningPlan.findFirst({
        where: { date: new Date(`${dateIso}T00:00:00.000Z`) },
        include: { tasks: true },
      });
      const task = plan?.tasks.find((t) => t.roomId === roomId);
      if (task) {
        await this.daily.patchTask(
          task.id,
          { assigneeUserId: housekeeperUserId, pinned: true },
          assigner,
        );
      }
    } catch (e) {
      this.logger.warn(`Failed to sync daily plan after manual assign: ${(e as Error).message}`);
    }

    const room = await this.rooms.findOne(roomId);
    this.realtime.emitRoomStatus(room);
    this.emma?.scheduleRoomStatusSync('assignments.manualAssign');
    return row;
  }

  /** @deprecated Prefer daily-plan suggest — kept for API compatibility. */
  async suggestions(date?: string): Promise<AssignmentSuggestionsResponse> {
    const plan = await this.daily.suggest(date);
    const roomSuggestions = plan.tasks
      .filter((t) => t.kind === 'ROOM' && t.assigneeUserId)
      .map((t) => ({
        roomId: t.roomId!,
        roomNumber: t.roomNumber ?? '',
        floor: t.floor,
        suggestedHousekeeperId: t.assigneeUserId!,
      }));
    return {
      date: plan.date,
      departureRooms: roomSuggestions.length,
      suggestions: roomSuggestions,
      summaries: plan.summaries.map((s) => ({
        housekeeperId: s.housekeeperId,
        count: s.roomCount + s.restantCount,
        floors: s.floors,
      })),
    };
  }

  /** @deprecated Prefer daily-plan save — kept for API compatibility. */
  async runAutoAssignment(date?: string, assigner?: User): Promise<RunAutoAssignResponse> {
    await this.daily.suggest(date);
    if (assigner) {
      const saved = await this.daily.save(date, assigner);
      return {
        date: saved.date,
        assigned: saved.tasks.filter((t) => t.kind === 'ROOM' && t.assigneeUserId).length,
        summaries: saved.summaries.map((s) => ({
          housekeeperId: s.housekeeperId,
          count: s.roomCount + s.restantCount,
          floors: s.floors,
        })),
      };
    }
    const plan = await this.daily.getDailyPlan(date);
    return {
      date: plan.date,
      assigned: 0,
      summaries: plan.summaries.map((s) => ({
        housekeeperId: s.housekeeperId,
        count: s.roomCount + s.restantCount,
        floors: s.floors,
      })),
    };
  }
}
