import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  forwardRef,
} from '@nestjs/common';
import type { AssignmentSuggestionsResponse, RunAutoAssignResponse } from '@housekeeping/shared';
import { hotelTodayIso } from '@housekeeping/shared';
import { AssignmentStatus, User, UserRole } from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { DeparturesService } from '../departures/departures.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmmaService } from '../emma/emma.service';
import { balanceDepartureAssignments } from './assignment-balancer';

@Injectable()
export class AssignmentsService implements OnModuleInit {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
    private readonly departures: DeparturesService,
    @Optional()
    @Inject(forwardRef(() => EmmaService))
    private readonly emma?: EmmaService,
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
    this.emma?.scheduleRoomStatusSync('assignments.manualAssign');
    return row;
  }

  private resolveDate(date?: string): string {
    return date?.trim() || hotelTodayIso();
  }

  private async eligibleHousekeepers() {
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
    return housekeepers.filter((h) => shiftUserIds.size === 0 || shiftUserIds.has(h.id));
  }

  private async buildDeparturePlan(date?: string) {
    const resolvedDate = this.resolveDate(date);
    const departureRooms = await this.departures.listAssignableDepartureRooms(resolvedDate);
    const eligible = await this.eligibleHousekeepers();
    const loads = await Promise.all(
      eligible.map(async (u) => ({
        housekeeperId: u.id,
        currentCount: await this.prisma.roomAssignment.count({
          where: { housekeeperUserId: u.id, status: AssignmentStatus.ACTIVE },
        }),
      })),
    );
    const { assignments, summaries } = balanceDepartureAssignments(
      departureRooms.map((r) => ({
        roomId: r.roomId,
        roomNumber: r.roomNumber,
        floor: r.floor,
      })),
      loads,
    );
    return { resolvedDate, departureRooms, assignments, summaries };
  }

  async suggestions(date?: string): Promise<AssignmentSuggestionsResponse> {
    const { resolvedDate, departureRooms, assignments, summaries } = await this.buildDeparturePlan(date);
    return {
      date: resolvedDate,
      departureRooms: departureRooms.length,
      suggestions: assignments.map((a) => ({
        roomId: a.roomId,
        roomNumber: a.roomNumber,
        floor: a.floor,
        suggestedHousekeeperId: a.housekeeperId,
      })),
      summaries,
    };
  }

  async runAutoAssignment(date?: string, assigner?: User): Promise<RunAutoAssignResponse> {
    const { resolvedDate, assignments, summaries } = await this.buildDeparturePlan(date);
    if (!assignments.length) return { date: resolvedDate, assigned: 0, summaries };

    let assigned = 0;
    for (const row of assignments) {
      await this.prisma.roomAssignment.updateMany({
        where: { roomId: row.roomId, status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] } },
        data: { status: AssignmentStatus.CANCELLED },
      });
      await this.prisma.roomAssignment.create({
        data: {
          roomId: row.roomId,
          housekeeperUserId: row.housekeeperId,
          assignedByUserId: assigner?.id,
          status: AssignmentStatus.ACTIVE,
        },
      });
      const r = await this.rooms.findOne(row.roomId);
      this.realtime.emitRoomStatus(r);
      assigned += 1;
    }

    if (assigned > 0) {
      this.emma?.scheduleRoomStatusSync('assignments.autoAssign');
    }
    return { date: resolvedDate, assigned, summaries };
  }
}
