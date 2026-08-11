import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  formatHotelDateOnly,
  hotelTodayIso,
  DerivedRoomStatus,
  type DailyCleaningPlanResponse,
  type DailyCleaningTaskDto,
  type DailyCleaningAssignee,
  type DeferredRoomDto,
  type MyDailyTaskDto,
  type PublicAreaDto,
} from '@housekeeping/shared';
import {
  AssignmentStatus,
  DailyCleaningPlanStatus,
  DailyCleaningTaskKind,
  DailyCleaningTaskSource,
  DailyCleaningWorkType,
  DailyInspectionTaskStatus,
  PublicAreaKind,
  User,
  UserRole,
  UserTitlePrefix,
} from '@prisma/client';
import { userPublicSelect } from '../common/user-public.select';
import { readEmmaMetadata } from '../emma/emma-room-status-sync';
import { PrismaService } from '../prisma/prisma.service';
import { RoomOccupancyService } from '../rooms/room-occupancy.service';
import { RoomStatusService } from '../rooms/room-status.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { InspectionQueueService } from './inspection-queue.service';
import {
  LATE_ROOM_WEIGHT,
  addDaysIso,
  balanceDailyCleaningAssignments,
  dateOnlyFromIso,
  dayBoundsFromIso,
  daysBetweenIso,
  isLateShiftWindow,
  isPublicAreaDue,
  type BalanceWorkItem,
  type EligibleCleaner,
} from './assignment-balancer';

type PlanWithTasks = Awaited<ReturnType<DailyCleaningService['loadPlan']>>;

@Injectable()
export class DailyCleaningService implements OnModuleInit {
  private readonly logger = new Logger(DailyCleaningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roomStatus: RoomStatusService,
    private readonly occupancy: RoomOccupancyService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
    private readonly inspectionQueue: InspectionQueueService,
  ) {}

  onModuleInit() {
    this.releaseInactiveHousekeeperAssignments().catch((e) =>
      this.logger.warn(`Failed to release inactive housekeeper assignments: ${(e as Error).message}`),
    );
    this.clearStaleAssignmentsIfNoSavedPlan().catch((e) =>
      this.logger.warn(`Failed to clear stale assignments: ${(e as Error).message}`),
    );
  }

  private async releaseInactiveHousekeeperAssignments() {
    const result = await this.prisma.roomAssignment.updateMany({
      where: {
        status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] },
        housekeeper: { isActive: false },
      },
      data: { status: AssignmentStatus.CANCELLED },
    });
    if (result.count > 0) {
      this.logger.log(`Released ${result.count} assignment(s) from inactive housekeepers`);
    }
  }

  /** Before today's plan is saved, drop leftover assignments from prior days. */
  private async clearStaleAssignmentsIfNoSavedPlan() {
    const today = hotelTodayIso();
    const plan = await this.prisma.dailyCleaningPlan.findUnique({
      where: { date: dateOnlyFromIso(today) },
    });
    if (plan?.status === DailyCleaningPlanStatus.SAVED) return;
    const { from } = dayBoundsFromIso(today);
    const result = await this.prisma.roomAssignment.updateMany({
      where: {
        status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] },
        assignedAt: { lt: from },
      },
      data: { status: AssignmentStatus.CANCELLED },
    });
    if (result.count > 0) {
      this.logger.log(`Cleared ${result.count} stale room assignment(s) from before ${today}`);
    }
  }

  resolveDate(date?: string): string {
    const raw = date?.trim() || hotelTodayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new BadRequestException('"date" must be YYYY-MM-DD');
    }
    return raw;
  }

  private async loadPlan(dateIso: string) {
    return this.prisma.dailyCleaningPlan.findUnique({
      where: { date: dateOnlyFromIso(dateIso) },
      include: {
        tasks: {
          include: {
            room: { select: { id: true, roomNumber: true, floor: true } },
            publicArea: true,
            assignee: { select: userPublicSelect },
          },
          orderBy: [{ workType: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  private async ensurePlan(dateIso: string) {
    const date = dateOnlyFromIso(dateIso);
    return this.prisma.dailyCleaningPlan.upsert({
      where: { date },
      create: { date, status: DailyCleaningPlanStatus.DRAFT },
      update: {},
      include: {
        tasks: {
          include: {
            room: { select: { id: true, roomNumber: true, floor: true } },
            publicArea: true,
            assignee: { select: userPublicSelect },
          },
        },
      },
    });
  }

  async listEligibleCleaners(dateIso: string): Promise<{
    eligible: DailyCleaningAssignee[];
    manual: DailyCleaningAssignee[];
    warnings: string[];
    onShift: DailyCleaningAssignee[];
    allCleaners: DailyCleaningAssignee[];
  }> {
    const { shiftByUser, overrideByUser } = await this.loadShiftContext(dateIso);

    const toAssignee = (u: {
      id: string;
      name: string;
      titlePrefix: string;
      role: string;
    }): DailyCleaningAssignee => {
      const shift = shiftByUser.get(u.id);
      const autoLate = shift ? isLateShiftWindow(shift.startsAt, shift.endsAt) : false;
      const ov = overrideByUser.get(u.id);
      const isLateShift = ov ?? autoLate;
      return {
        id: u.id,
        name: u.name,
        titlePrefix: u.titlePrefix,
        role: u.role,
        isLateShift,
        lateShiftSource: ov != null ? 'override' : autoLate ? 'auto' : 'none',
      };
    };

    const crewUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: UserRole.HOUSEKEEPER, titlePrefix: UserTitlePrefix.CLEANER },
          { role: UserRole.SUPERVISOR },
          { titlePrefix: UserTitlePrefix.HOUSEKEEPING_SUPERVISOR },
        ],
      },
      select: { id: true, name: true, titlePrefix: true, role: true },
      orderBy: { name: 'asc' },
    });

    /** Cleaners + housekeeping supervisors — selectable for “who works today”. */
    const allCleaners = crewUsers.map(toAssignee);
    const onShift = allCleaners.filter((c) => shiftByUser.has(c.id));

    const workingRows = await this.prisma.dailyWorkingStaff.findMany({
      where: { date: dateOnlyFromIso(dateIso) },
      select: { userId: true },
    });

    let eligible: DailyCleaningAssignee[];
    const warnings: string[] = [];
    if (workingRows.length > 0) {
      const selected = new Set(workingRows.map((r) => r.userId));
      eligible = allCleaners.filter((c) => selected.has(c.id));
      if (eligible.length === 0) {
        warnings.push(
          'Working-today list is empty — add cleaners or HSK supervisors before running auto-assign.',
        );
      }
    } else {
      eligible = onShift;
      if (eligible.length === 0) {
        warnings.push(
          shiftByUser.size === 0
            ? 'No shifts found for this day — select who works today manually.'
            : 'No cleaners or HSK supervisors on shift for this day — select who works today manually.',
        );
      }
    }

    return {
      eligible,
      manual: allCleaners,
      warnings,
      onShift,
      allCleaners,
    };
  }

  private async loadShiftContext(dateIso: string) {
    const { from, to } = dayBoundsFromIso(dateIso);
    const shifts = await this.prisma.shift.findMany({
      where: { startsAt: { lt: to }, endsAt: { gt: from } },
      select: { userId: true, startsAt: true, endsAt: true },
    });
    const overrides = await this.prisma.dailyLateShiftOverride.findMany({
      where: { date: dateOnlyFromIso(dateIso) },
    });
    const overrideByUser = new Map(overrides.map((o) => [o.userId, o.isLateShift]));

    const shiftByUser = new Map<string, { startsAt: Date; endsAt: Date }>();
    for (const s of shifts) {
      const prev = shiftByUser.get(s.userId);
      if (!prev || s.startsAt < prev.startsAt) {
        shiftByUser.set(s.userId, { startsAt: s.startsAt, endsAt: s.endsAt });
      }
    }

    return { shiftByUser, overrideByUser };
  }

  async setWorkingToday(dateIso: string, userIds: string[]) {
    const date = dateOnlyFromIso(dateIso);
    const unique = [...new Set(userIds.filter(Boolean))];
    const { allCleaners } = await this.listEligibleCleaners(dateIso);
    const allowed = new Set(allCleaners.map((c) => c.id));
    for (const id of unique) {
      if (!allowed.has(id)) {
        throw new ForbiddenException(
          `User ${id} is not an active cleaner or housekeeping supervisor`,
        );
      }
    }
    await this.prisma.$transaction([
      this.prisma.dailyWorkingStaff.deleteMany({ where: { date } }),
      ...(unique.length
        ? [
            this.prisma.dailyWorkingStaff.createMany({
              data: unique.map((userId) => ({ date, userId })),
            }),
          ]
        : []),
    ]);
  }

  private async buildDirtyRoomWork(dateIso: string) {
    const rooms = await this.prisma.room.findMany({
      include: {
        checklistStates: {
          take: 1,
          include: { tasks: true },
        },
        inspections: { orderBy: { inspectedAt: 'desc' }, take: 3 },
      },
    });

    const occupancy = await this.occupancy.mapForRoomNumbers(rooms.map((r) => r.roomNumber));
    const date = dateOnlyFromIso(dateIso);
    const deferrals = await this.prisma.roomCleaningDeferral.findMany({
      where: { clearedAt: null },
      orderBy: { firstDeferredOn: 'asc' },
    });
    const activeDeferralByRoom = new Map<string, (typeof deferrals)[0]>();
    for (const d of deferrals) {
      if (!activeDeferralByRoom.has(d.roomId)) activeDeferralByRoom.set(d.roomId, d);
    }

    const items: Array<{
      roomId: string;
      roomNumber: string;
      floor: number | null;
      workType: 'DIRTY' | 'RESTANT';
      overdueDays: number | null;
    }> = [];

    for (const room of rooms) {
      const emma = readEmmaMetadata(room.metadata);
      const tasks = room.checklistStates[0]?.tasks ?? [];
      const status = this.roomStatus.derive(room, tasks, room.inspections, emma);
      if (status !== DerivedRoomStatus.DIRTY) continue;

      const deferral = activeDeferralByRoom.get(room.id);
      if (deferral) {
        const until = formatHotelDateOnly(deferral.deferredUntil);
        if (until > dateIso) continue; // skipped until a later day
      }

      const occ = occupancy.get(room.roomNumber);
      const workType: 'DIRTY' | 'RESTANT' = occ?.isRestant ? 'RESTANT' : 'DIRTY';
      let overdueDays: number | null = null;
      if (deferral) {
        const first = formatHotelDateOnly(deferral.firstDeferredOn);
        const days = daysBetweenIso(first, dateIso);
        if (days > 0) overdueDays = days;
      }

      items.push({
        roomId: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        workType,
        overdueDays,
      });
    }

    return items;
  }

  /**
   * CLEAN + overnight INSPECTED rooms are not cleaning work — they go on the inspection queue
   * when inspectors are scheduled for the day.
   */
  private async syncInspectReadyRooms(dateIso: string) {
    const rooms = await this.prisma.room.findMany({
      include: {
        checklistStates: { take: 1, include: { tasks: true } },
        inspections: { orderBy: { inspectedAt: 'desc' }, take: 3 },
      },
    });
    const readyIds: string[] = [];
    for (const room of rooms) {
      if (room.outOfOrder) continue;
      const emma = readEmmaMetadata(room.metadata);
      const tasks = room.checklistStates[0]?.tasks ?? [];
      const status = this.roomStatus.derive(room, tasks, room.inspections, emma);
      if (
        status === DerivedRoomStatus.CLEAN ||
        status === DerivedRoomStatus.INSPECTED
      ) {
        readyIds.push(room.id);
      }
    }
    await this.inspectionQueue.ensurePendingForRooms(readyIds, dateIso);
  }

  private async buildPublicWork(dateIso: string) {
    const areas = await this.prisma.publicArea.findMany({ where: { isActive: true } });
    return areas
      .filter((a) =>
        isPublicAreaDue({
          lastCompletedOn: a.lastCompletedOn ? formatHotelDateOnly(a.lastCompletedOn) : null,
          frequencyDays: a.frequencyDays,
          dateIso,
        }),
      )
      .map((a) => ({
        publicAreaId: a.id,
        name: a.name,
        floor: a.floor,
        kind: a.kind,
      }));
  }

  /** Sync DB tasks to current dirty/due work; preserve pins & assignees where possible. */
  async syncWorkItems(dateIso: string) {
    const plan = await this.ensurePlan(dateIso);
    const rooms = await this.buildDirtyRoomWork(dateIso);
    const publics = await this.buildPublicWork(dateIso);

    const desiredRoomIds = new Set(rooms.map((r) => r.roomId));
    const desiredPublicIds = new Set(publics.map((p) => p.publicAreaId));

    for (const task of plan.tasks) {
      if (task.kind === DailyCleaningTaskKind.ROOM && task.roomId && !desiredRoomIds.has(task.roomId)) {
        if (!task.pinned) {
          await this.prisma.dailyCleaningTask.delete({ where: { id: task.id } });
        }
      }
      if (
        task.kind === DailyCleaningTaskKind.PUBLIC_AREA &&
        task.publicAreaId &&
        !desiredPublicIds.has(task.publicAreaId)
      ) {
        if (!task.pinned && !task.completedAt) {
          await this.prisma.dailyCleaningTask.delete({ where: { id: task.id } });
        }
      }
    }

    const fresh = await this.loadPlan(dateIso);
    const byRoom = new Map(
      (fresh?.tasks ?? []).filter((t) => t.roomId).map((t) => [t.roomId!, t]),
    );
    const byPublic = new Map(
      (fresh?.tasks ?? []).filter((t) => t.publicAreaId).map((t) => [t.publicAreaId!, t]),
    );

    for (const r of rooms) {
      const existing = byRoom.get(r.roomId);
      if (existing) {
        await this.prisma.dailyCleaningTask.update({
          where: { id: existing.id },
          data: {
            workType:
              r.workType === 'RESTANT'
                ? DailyCleaningWorkType.RESTANT
                : DailyCleaningWorkType.DIRTY,
            overdueDays: r.overdueDays,
          },
        });
      } else {
        await this.prisma.dailyCleaningTask.create({
          data: {
            planId: plan.id,
            kind: DailyCleaningTaskKind.ROOM,
            workType:
              r.workType === 'RESTANT'
                ? DailyCleaningWorkType.RESTANT
                : DailyCleaningWorkType.DIRTY,
            roomId: r.roomId,
            overdueDays: r.overdueDays,
          },
        });
      }
    }

    for (const p of publics) {
      const existing = byPublic.get(p.publicAreaId);
      if (!existing) {
        await this.prisma.dailyCleaningTask.create({
          data: {
            planId: plan.id,
            kind: DailyCleaningTaskKind.PUBLIC_AREA,
            workType: DailyCleaningWorkType.PUBLIC,
            publicAreaId: p.publicAreaId,
          },
        });
      }
    }

    return this.loadPlan(dateIso);
  }

  private toTaskDto(
    task: NonNullable<PlanWithTasks>['tasks'][number],
  ): DailyCleaningTaskDto {
    return {
      id: task.id,
      kind: task.kind,
      workType: task.workType,
      roomId: task.roomId,
      roomNumber: task.room?.roomNumber ?? null,
      floor: task.room?.floor ?? task.publicArea?.floor ?? null,
      publicAreaId: task.publicAreaId,
      publicAreaName: task.publicArea?.name ?? null,
      publicAreaKind: (task.publicArea?.kind as PublicAreaDto['kind']) ?? null,
      assigneeUserId: task.assigneeUserId,
      pinned: task.pinned,
      source: task.source,
      overdueDays: task.overdueDays,
      completedAt: task.completedAt?.toISOString() ?? null,
    };
  }

  async getDailyPlan(date?: string): Promise<DailyCleaningPlanResponse> {
    const dateIso = this.resolveDate(date);
    if (dateIso === hotelTodayIso()) {
      const existing = await this.prisma.dailyCleaningPlan.findUnique({
        where: { date: dateOnlyFromIso(dateIso) },
      });
      if (!existing || existing.status !== DailyCleaningPlanStatus.SAVED) {
        // Drop leftover assignments from previous days; keep same-day manual board pins.
        const { from } = dayBoundsFromIso(dateIso);
        await this.prisma.roomAssignment.updateMany({
          where: {
            status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] },
            assignedAt: { lt: from },
          },
          data: { status: AssignmentStatus.CANCELLED },
        });
      }
    }
    await this.syncWorkItems(dateIso);
    await this.syncInspectReadyRooms(dateIso);
    const plan = await this.loadPlan(dateIso);
    if (!plan) throw new NotFoundException('Plan not found');

    const { eligible, manual, warnings, onShift, allCleaners } =
      await this.listEligibleCleaners(dateIso);
    const inspectorCandidates = await this.inspectionQueue.listInspectorCandidates();
    const inspectorsToday = await this.inspectionQueue.listInspectorsForDate(dateIso);
    const tasks = plan.tasks.map((t) => this.toTaskDto(t));

    const openTasks = tasks.filter((t) => !t.completedAt);
    const workPreview = {
      dirtyRoomCount: openTasks.filter((t) => t.workType === 'DIRTY').length,
      restantCount: openTasks.filter((t) => t.workType === 'RESTANT').length,
      publicCount: openTasks.filter((t) => t.workType === 'PUBLIC').length,
    };

    const { summaries } = balanceDailyCleaningAssignments(
      tasks.map((t) => ({
        key: t.id,
        kind: t.kind,
        workType: t.workType,
        roomId: t.roomId ?? undefined,
        roomNumber: t.roomNumber ?? undefined,
        floor: t.floor,
        publicAreaId: t.publicAreaId ?? undefined,
        pinned: t.pinned,
        assigneeUserId: t.assigneeUserId,
      })),
      eligible.map((e) => ({
        housekeeperId: e.id,
        isLateShift: e.isLateShift,
        roomWeight: e.isLateShift ? LATE_ROOM_WEIGHT : 1,
      })),
    );

    const deferredRooms = await this.listDeferredRooms(dateIso);

    return {
      date: dateIso,
      status: plan.status,
      savedAt: plan.savedAt?.toISOString() ?? null,
      suggested: plan.tasks.some((t) => t.assigneeUserId != null),
      warnings,
      workingToday: eligible,
      eligibleCleaners: eligible,
      onShiftCleaners: onShift,
      allCleaners,
      manualAssignees: manual,
      inspectorCandidates,
      inspectorsToday,
      workPreview,
      deferredRooms,
      tasks,
      summaries,
    };
  }

  /** Rooms skipped until a later hotel day (shown in board “Tomorrow” column). */
  async listDeferredRooms(dateIso: string): Promise<DeferredRoomDto[]> {
    const rows = await this.prisma.roomCleaningDeferral.findMany({
      where: {
        clearedAt: null,
        deferredUntil: { gt: dateOnlyFromIso(dateIso) },
      },
      include: { room: { select: { id: true, roomNumber: true, floor: true } } },
      orderBy: [{ room: { roomNumber: 'asc' } }],
    });
    return rows.map((d) => {
      const first = formatHotelDateOnly(d.firstDeferredOn);
      const until = formatHotelDateOnly(d.deferredUntil);
      const days = daysBetweenIso(first, dateIso);
      return {
        roomId: d.room.id,
        roomNumber: d.room.roomNumber,
        floor: d.room.floor,
        deferredUntil: until,
        firstDeferredOn: first,
        overdueDays: Math.max(0, days),
      };
    });
  }

  async suggest(date?: string): Promise<DailyCleaningPlanResponse> {
    return this.runAutoAssign(date, {});
  }

  /**
   * Run auto-assign with supervisor choices for restant / late shift / public cleaning.
   * Writes RoomAssignments so the board updates immediately; Save locks the day.
   */
  async runAutoAssign(
    date: string | undefined,
    options: {
      workingTodayUserIds?: string[];
      restantAssigneeUserId?: string | null;
      lateShiftUserIds?: string[];
      publicAssigneeUserIds?: string[];
      inspectorUserIds?: string[];
    },
    assigner?: User,
  ): Promise<DailyCleaningPlanResponse> {
    const dateIso = this.resolveDate(date);
    await this.syncWorkItems(dateIso);
    let plan = await this.loadPlan(dateIso);
    if (!plan) throw new NotFoundException('Plan not found');

    // Re-running unlocks the day until they save again
    if (plan.status === DailyCleaningPlanStatus.SAVED) {
      await this.prisma.dailyCleaningPlan.update({
        where: { id: plan.id },
        data: { status: DailyCleaningPlanStatus.DRAFT, savedAt: null, savedByUserId: null },
      });
      plan = await this.loadPlan(dateIso);
      if (!plan) throw new NotFoundException('Plan not found');
    }

    if (options.workingTodayUserIds !== undefined) {
      if (options.workingTodayUserIds.length === 0) {
        throw new BadRequestException(
          'Select at least one cleaner or HSK supervisor who works today.',
        );
      }
      await this.setWorkingToday(dateIso, options.workingTodayUserIds);
    }

    if (options.inspectorUserIds !== undefined) {
      await this.inspectionQueue.setInspectorsForDate(dateIso, options.inspectorUserIds);
      await this.syncInspectReadyRooms(dateIso);
    }

    const lateIds = new Set(options.lateShiftUserIds ?? []);
    const { eligible } = await this.listEligibleCleaners(dateIso);

    if (eligible.length === 0) {
      throw new BadRequestException(
        'No one on the working-today list — select who works today before running.',
      );
    }

    // Apply late-shift overrides for everyone we know about today
    const allKnownIds = new Set(
      [
        ...eligible.map((e) => e.id),
        ...(options.workingTodayUserIds ?? []),
        ...(options.lateShiftUserIds ?? []),
        ...(options.publicAssigneeUserIds ?? []),
        options.restantAssigneeUserId,
      ].filter(Boolean) as string[],
    );

    for (const userId of allKnownIds) {
      await this.prisma.dailyLateShiftOverride.upsert({
        where: { date_userId: { date: dateOnlyFromIso(dateIso), userId } },
        create: {
          date: dateOnlyFromIso(dateIso),
          userId,
          isLateShift: lateIds.has(userId),
          planId: plan.id,
        },
        update: { isLateShift: lateIds.has(userId), planId: plan.id },
      });
    }

    // Refresh eligible with overrides applied
    const refreshed = await this.listEligibleCleaners(dateIso);
    plan = await this.loadPlan(dateIso);
    if (!plan) throw new NotFoundException('Plan not found');

    // Reset unpinned AUTO tasks so re-run redistributes; keep MANUAL pins
    for (const task of plan.tasks) {
      if (task.pinned || task.source === DailyCleaningTaskSource.MANUAL) continue;
      if (task.completedAt) continue;
      await this.prisma.dailyCleaningTask.update({
        where: { id: task.id },
        data: { assigneeUserId: null, source: DailyCleaningTaskSource.AUTO },
      });
    }
    plan = await this.loadPlan(dateIso);
    if (!plan) throw new NotFoundException('Plan not found');

    // Pin restant + public from supervisor choices before balancing dirty rooms
    if (options.restantAssigneeUserId) {
      for (const task of plan.tasks) {
        if (task.workType !== DailyCleaningWorkType.RESTANT || task.completedAt) continue;
        if (task.pinned && task.source === DailyCleaningTaskSource.MANUAL) continue;
        await this.prisma.dailyCleaningTask.update({
          where: { id: task.id },
          data: {
            assigneeUserId: options.restantAssigneeUserId,
            pinned: true,
            source: DailyCleaningTaskSource.AUTO,
          },
        });
      }
    }

    const publicIds = options.publicAssigneeUserIds?.filter(Boolean) ?? [];
    if (publicIds.length > 0) {
      let idx = 0;
      for (const task of plan.tasks) {
        if (task.workType !== DailyCleaningWorkType.PUBLIC || task.completedAt) continue;
        if (task.pinned && task.source === DailyCleaningTaskSource.MANUAL) continue;
        const hk = publicIds[idx % publicIds.length]!;
        idx += 1;
        await this.prisma.dailyCleaningTask.update({
          where: { id: task.id },
          data: {
            assigneeUserId: hk,
            pinned: true,
            source: DailyCleaningTaskSource.AUTO,
          },
        });
      }
    }

    plan = await this.loadPlan(dateIso);
    if (!plan) throw new NotFoundException('Plan not found');

    const items: BalanceWorkItem[] = plan.tasks
      .filter((t) => !t.completedAt)
      .map((t) => ({
        key: t.id,
        kind: t.kind === DailyCleaningTaskKind.PUBLIC_AREA ? 'PUBLIC_AREA' : 'ROOM',
        workType: t.workType as BalanceWorkItem['workType'],
        roomId: t.roomId ?? undefined,
        roomNumber: t.room?.roomNumber,
        floor: t.room?.floor ?? t.publicArea?.floor ?? null,
        publicAreaId: t.publicAreaId ?? undefined,
        pinned: t.pinned,
        assigneeUserId: t.assigneeUserId,
      }));

    const cleaners: EligibleCleaner[] = refreshed.eligible.map((e) => ({
      housekeeperId: e.id,
      isLateShift: e.isLateShift,
      roomWeight: e.isLateShift ? LATE_ROOM_WEIGHT : 1,
    }));

    const { assignments } = balanceDailyCleaningAssignments(items, cleaners, {
      preferredRestantId: options.restantAssigneeUserId,
      publicAssigneeIds: publicIds,
    });
    const byKey = new Map(assignments.map((a) => [a.key, a.housekeeperId]));

    for (const task of plan.tasks) {
      if (task.completedAt) continue;
      const hk = byKey.get(task.id);
      if (!hk) continue;
      // Don't move manual pins
      if (task.pinned && task.source === DailyCleaningTaskSource.MANUAL && task.assigneeUserId) {
        continue;
      }
      await this.prisma.dailyCleaningTask.update({
        where: { id: task.id },
        data: {
          assigneeUserId: hk,
          source:
            task.workType === DailyCleaningWorkType.DIRTY
              ? DailyCleaningTaskSource.AUTO
              : task.source,
          pinned:
            task.workType === DailyCleaningWorkType.RESTANT ||
            task.workType === DailyCleaningWorkType.PUBLIC
              ? true
              : task.pinned,
        },
      });
    }

    // Preview on board immediately
    await this.syncRoomAssignmentsFromPlan(dateIso, assigner?.id ?? null);

    return this.getDailyPlan(dateIso);
  }

  async save(date: string | undefined, user: User): Promise<DailyCleaningPlanResponse> {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const dateIso = this.resolveDate(date);
    const plan = await this.loadPlan(dateIso);
    if (!plan) throw new NotFoundException('Plan not found — run suggest first');

    await this.prisma.dailyCleaningPlan.update({
      where: { id: plan.id },
      data: {
        status: DailyCleaningPlanStatus.SAVED,
        savedAt: new Date(),
        savedByUserId: user.id,
      },
    });

    await this.syncRoomAssignmentsFromPlan(dateIso, user.id);
    return this.getDailyPlan(dateIso);
  }

  /**
   * Wipe supervisor choices for the hotel day and return to a fresh draft:
   * Mirus shift defaults for working-today, no assignments, no late/inspector overrides,
   * no skips, plan unlocked. Does not change room clean/dirty status or Mirus shifts.
   */
  async resetDay(date: string | undefined, user: User): Promise<DailyCleaningPlanResponse> {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const dateIso = this.resolveDate(date);
    const day = dateOnlyFromIso(dateIso);
    const { from, to } = dayBoundsFromIso(dateIso);

    const plan = await this.prisma.dailyCleaningPlan.findUnique({
      where: { date: day },
      include: { tasks: true },
    });

    const completedPublicIds = [
      ...new Set(
        (plan?.tasks ?? [])
          .filter(
            (t) =>
              t.kind === DailyCleaningTaskKind.PUBLIC_AREA &&
              t.publicAreaId &&
              t.completedAt != null,
          )
          .map((t) => t.publicAreaId!),
      ),
    ];

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyWorkingStaff.deleteMany({ where: { date: day } });
      await tx.dailyLateShiftOverride.deleteMany({ where: { date: day } });
      await tx.dailyInspectionDuty.deleteMany({ where: { date: day } });
      await tx.dailyInspectionTask.deleteMany({ where: { date: day } });

      await tx.roomCleaningDeferral.updateMany({
        where: { clearedAt: null, deferredUntil: { gt: day } },
        data: { clearedAt: new Date() },
      });

      await tx.roomAssignment.updateMany({
        where: {
          status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] },
          assignedAt: { gte: from, lt: to },
        },
        data: { status: AssignmentStatus.CANCELLED },
      });

      // Also drop any live pins still tied to this plan's rooms (edge: clock skew / bounds).
      const planRoomIds = (plan?.tasks ?? [])
        .map((t) => t.roomId)
        .filter((id): id is string => Boolean(id));
      if (planRoomIds.length) {
        await tx.roomAssignment.updateMany({
          where: {
            roomId: { in: planRoomIds },
            status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] },
          },
          data: { status: AssignmentStatus.CANCELLED },
        });
      }

      if (completedPublicIds.length) {
        await tx.publicArea.updateMany({
          where: { id: { in: completedPublicIds }, lastCompletedOn: day },
          data: { lastCompletedOn: null },
        });
      }

      if (plan) {
        await tx.dailyCleaningTask.deleteMany({ where: { planId: plan.id } });
        await tx.dailyCleaningPlan.update({
          where: { id: plan.id },
          data: {
            status: DailyCleaningPlanStatus.DRAFT,
            savedAt: null,
            savedByUserId: null,
          },
        });
      }
    });

    this.logger.log(`Reset daily cleaning plan for ${dateIso} by user ${user.id}`);
    return this.getDailyPlan(dateIso);
  }

  private async syncRoomAssignmentsFromPlan(dateIso: string, assignerId: string | null) {
    const plan = await this.loadPlan(dateIso);
    if (!plan) return;

    const roomTasks = plan.tasks.filter(
      (t) => t.kind === DailyCleaningTaskKind.ROOM && t.roomId && t.assigneeUserId,
    );
    const assignedRoomIds = new Set(roomTasks.map((t) => t.roomId!));

    // Cancel all active assignments not in today's plan
    const active = await this.prisma.roomAssignment.findMany({
      where: { status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] } },
    });
    for (const a of active) {
      if (!assignedRoomIds.has(a.roomId)) {
        await this.prisma.roomAssignment.update({
          where: { id: a.id },
          data: { status: AssignmentStatus.CANCELLED },
        });
      }
    }

    for (const task of roomTasks) {
      const existing = await this.prisma.roomAssignment.findFirst({
        where: {
          roomId: task.roomId!,
          status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] },
        },
      });
      if (existing && existing.housekeeperUserId === task.assigneeUserId) continue;
      if (existing) {
        await this.prisma.roomAssignment.update({
          where: { id: existing.id },
          data: { status: AssignmentStatus.CANCELLED },
        });
      }
      await this.prisma.roomAssignment.create({
        data: {
          roomId: task.roomId!,
          housekeeperUserId: task.assigneeUserId!,
          assignedByUserId: assignerId,
          status: AssignmentStatus.ACTIVE,
        },
      });
      try {
        const room = await this.rooms.findOne(task.roomId!);
        this.realtime.emitRoomStatus(room);
      } catch {
        /* ignore */
      }
    }
  }

  async unassignRoom(roomId: string, user: User) {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    await this.prisma.roomAssignment.updateMany({
      where: { roomId, status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] } },
      data: { status: AssignmentStatus.CANCELLED },
    });

    const dateIso = hotelTodayIso();
    const plan = await this.loadPlan(dateIso);
    if (plan) {
      const task = plan.tasks.find((t) => t.roomId === roomId);
      if (task) {
        await this.prisma.dailyCleaningTask.update({
          where: { id: task.id },
          data: {
            assigneeUserId: null,
            pinned: false,
            source: DailyCleaningTaskSource.MANUAL,
          },
        });
      }
    }

    try {
      const room = await this.rooms.findOne(roomId);
      this.realtime.emitRoomStatus(room);
    } catch {
      /* ignore */
    }
    return { ok: true, roomId };
  }

  async patchTask(
    taskId: string,
    body: { assigneeUserId?: string | null; pinned?: boolean },
    user: User,
  ) {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const task = await this.prisma.dailyCleaningTask.findUnique({
      where: { id: taskId },
      include: { plan: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const data: {
      assigneeUserId?: string | null;
      pinned?: boolean;
      source?: DailyCleaningTaskSource;
    } = {};
    if (body.assigneeUserId !== undefined) {
      if (body.assigneeUserId) {
        const assignee = await this.prisma.user.findFirst({
          where: {
            id: body.assigneeUserId,
            isActive: true,
            OR: [
              { role: UserRole.HOUSEKEEPER, titlePrefix: UserTitlePrefix.CLEANER },
              { role: UserRole.SUPERVISOR },
              { role: UserRole.ADMIN },
              { titlePrefix: UserTitlePrefix.HOUSEKEEPING_SUPERVISOR },
            ],
          },
        });
        if (!assignee) throw new BadRequestException('Assignee not found or not allowed');
      }
      data.assigneeUserId = body.assigneeUserId;
      data.source = DailyCleaningTaskSource.MANUAL;
      data.pinned = true;
    }
    if (body.pinned !== undefined) data.pinned = body.pinned;

    await this.prisma.dailyCleaningTask.update({ where: { id: taskId }, data });

    const dateIso = formatHotelDateOnly(task.plan.date);
    if (task.plan.status === DailyCleaningPlanStatus.SAVED && body.assigneeUserId !== undefined) {
      await this.syncRoomAssignmentsFromPlan(dateIso, user.id);
    }
    return this.getDailyPlan(dateIso);
  }

  async skipRoom(roomId: string, date: string | undefined, user: User) {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const dateIso = this.resolveDate(date);
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    const existing = await this.prisma.roomCleaningDeferral.findFirst({
      where: { roomId, clearedAt: null },
      orderBy: { firstDeferredOn: 'asc' },
    });
    const tomorrow = addDaysIso(dateIso, 1);
    if (existing) {
      await this.prisma.roomCleaningDeferral.update({
        where: { id: existing.id },
        data: { deferredUntil: dateOnlyFromIso(tomorrow) },
      });
    } else {
      await this.prisma.roomCleaningDeferral.create({
        data: {
          roomId,
          firstDeferredOn: dateOnlyFromIso(dateIso),
          deferredUntil: dateOnlyFromIso(tomorrow),
        },
      });
    }

    const plan = await this.loadPlan(dateIso);
    if (plan) {
      await this.prisma.dailyCleaningTask.deleteMany({
        where: { planId: plan.id, roomId },
      });
    }

    // Cancel live assignment for skipped room
    await this.prisma.roomAssignment.updateMany({
      where: { roomId, status: { in: [AssignmentStatus.PENDING, AssignmentStatus.ACTIVE] } },
      data: { status: AssignmentStatus.CANCELLED },
    });

    return this.getDailyPlan(dateIso);
  }

  async unskipRoom(roomId: string, date: string | undefined, user: User) {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const dateIso = this.resolveDate(date);
    await this.prisma.roomCleaningDeferral.updateMany({
      where: {
        roomId,
        clearedAt: null,
        deferredUntil: { gt: dateOnlyFromIso(dateIso) },
      },
      data: { clearedAt: new Date() },
    });
    return this.getDailyPlan(dateIso);
  }

  async setLateShiftOverride(
    body: { userId: string; isLateShift: boolean; date?: string },
    user: User,
  ) {
    if (user.role !== UserRole.SUPERVISOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const dateIso = this.resolveDate(body.date);
    const plan = await this.ensurePlan(dateIso);
    await this.prisma.dailyLateShiftOverride.upsert({
      where: {
        date_userId: { date: dateOnlyFromIso(dateIso), userId: body.userId },
      },
      create: {
        date: dateOnlyFromIso(dateIso),
        userId: body.userId,
        isLateShift: body.isLateShift,
        planId: plan.id,
      },
      update: { isLateShift: body.isLateShift, planId: plan.id },
    });
    return this.getDailyPlan(dateIso);
  }

  async completePublicTask(taskId: string, user: User) {
    return this.completeDailyTask(taskId, user);
  }

  /**
   * Mark a public-area or RESTANT room task done.
   * RESTANT does not change PrizeBern room status or push Emma.
   * DIRTY rooms must use mark-clean instead.
   */
  async completeDailyTask(taskId: string, user: User) {
    const task = await this.prisma.dailyCleaningTask.findUnique({
      where: { id: taskId },
      include: { plan: true, publicArea: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const isAssignee = task.assigneeUserId === user.id;
    const isSupervisor = user.role === UserRole.SUPERVISOR || user.role === UserRole.ADMIN;
    if (!isAssignee && !isSupervisor) throw new ForbiddenException();
    if (task.completedAt) {
      const dateIso = formatHotelDateOnly(task.plan.date);
      return this.getDailyPlan(dateIso);
    }

    if (task.kind === DailyCleaningTaskKind.PUBLIC_AREA && task.publicAreaId) {
      const dateIso = formatHotelDateOnly(task.plan.date);
      await this.prisma.dailyCleaningTask.update({
        where: { id: taskId },
        data: { completedAt: new Date() },
      });
      await this.prisma.publicArea.update({
        where: { id: task.publicAreaId },
        data: { lastCompletedOn: dateOnlyFromIso(dateIso) },
      });
      return this.getDailyPlan(dateIso);
    }

    if (
      task.kind === DailyCleaningTaskKind.ROOM &&
      task.workType === DailyCleaningWorkType.RESTANT &&
      task.roomId
    ) {
      const dateIso = formatHotelDateOnly(task.plan.date);
      await this.prisma.dailyCleaningTask.update({
        where: { id: taskId },
        data: { completedAt: new Date() },
      });
      return this.getDailyPlan(dateIso);
    }

    if (
      task.kind === DailyCleaningTaskKind.ROOM &&
      task.workType === DailyCleaningWorkType.DIRTY
    ) {
      throw new BadRequestException('Dirty rooms must be finished with mark-clean');
    }

    throw new NotFoundException('Completable task not found');
  }

  async myDailyTasks(user: User): Promise<{ date: string; tasks: MyDailyTaskDto[] }> {
    const dateIso = hotelTodayIso();
    const plan = await this.prisma.dailyCleaningPlan.findUnique({
      where: { date: dateOnlyFromIso(dateIso) },
      include: {
        tasks: {
          where: { assigneeUserId: user.id },
          include: {
            room: { select: { id: true, roomNumber: true, floor: true } },
            publicArea: true,
          },
        },
      },
    });
    if (!plan || plan.status !== DailyCleaningPlanStatus.SAVED) {
      return { date: dateIso, tasks: [] };
    }

    const roomNumbers = plan.tasks
      .map((t) => t.room?.roomNumber)
      .filter((n): n is string => Boolean(n));
    const occupancyByRoom = await this.occupancy.mapForRoomNumbers(roomNumbers);

    return {
      date: dateIso,
      tasks: plan.tasks.map((t) => {
        const occ = t.room?.roomNumber ? occupancyByRoom.get(t.room.roomNumber) : undefined;
        return {
          id: t.id,
          kind: t.kind,
          workType: t.workType,
          roomId: t.roomId,
          roomNumber: t.room?.roomNumber ?? null,
          floor: t.room?.floor ?? t.publicArea?.floor ?? null,
          publicAreaId: t.publicAreaId,
          publicAreaName: t.publicArea?.name ?? null,
          overdueDays: t.overdueDays,
          completedAt: t.completedAt?.toISOString() ?? null,
          isDepartureToday: occ?.isDepartureToday ?? false,
          guestCheckedOut: occ ? Boolean(occ.checkOut || occ.ocoDone) : false,
          guestName: occ?.mainGuestName ?? null,
        };
      }),
    };
  }

  /** Clear overdue deferral when room is no longer dirty (called optionally). */
  async clearDeferralIfClean(roomId: string) {
    await this.prisma.roomCleaningDeferral.updateMany({
      where: { roomId, clearedAt: null },
      data: { clearedAt: new Date() },
    });
  }
}

@Injectable()
export class PublicAreasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dateIso?: string): Promise<PublicAreaDto[]> {
    const today = dateIso ?? hotelTodayIso();
    const rows = await this.prisma.publicArea.findMany({ orderBy: [{ floor: 'asc' }, { name: 'asc' }] });
    return rows.map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      floor: a.floor,
      kind: a.kind as PublicAreaDto['kind'],
      frequencyDays: a.frequencyDays,
      lastCompletedOn: a.lastCompletedOn ? formatHotelDateOnly(a.lastCompletedOn) : null,
      isActive: a.isActive,
      isDueToday: isPublicAreaDue({
        lastCompletedOn: a.lastCompletedOn ? formatHotelDateOnly(a.lastCompletedOn) : null,
        frequencyDays: a.frequencyDays,
        dateIso: today,
      }),
    }));
  }

  async create(body: {
    name: string;
    floor?: number | null;
    kind: PublicAreaKind;
    frequencyDays?: number;
    key?: string;
  }) {
    const key =
      body.key?.trim() ||
      `custom:${body.floor ?? 'x'}:${body.kind}:${body.name.trim().toLowerCase().replace(/\s+/g, '-')}`;
    return this.prisma.publicArea.create({
      data: {
        key,
        name: body.name.trim(),
        floor: body.floor ?? null,
        kind: body.kind,
        frequencyDays: body.frequencyDays ?? 1,
      },
    });
  }

  async update(
    id: string,
    body: {
      name?: string;
      floor?: number | null;
      kind?: PublicAreaKind;
      frequencyDays?: number;
      isActive?: boolean;
      lastCompletedOn?: string | null;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (body.name != null) data.name = body.name.trim();
    if (body.floor !== undefined) data.floor = body.floor;
    if (body.kind != null) data.kind = body.kind;
    if (body.frequencyDays != null) {
      if (body.frequencyDays < 1) throw new BadRequestException('frequencyDays must be >= 1');
      data.frequencyDays = body.frequencyDays;
    }
    if (body.isActive != null) data.isActive = body.isActive;
    if (body.lastCompletedOn !== undefined) {
      data.lastCompletedOn = body.lastCompletedOn ? dateOnlyFromIso(body.lastCompletedOn) : null;
    }
    return this.prisma.publicArea.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.prisma.publicArea.delete({ where: { id } });
    return { ok: true };
  }

  async syncFromFloorPlans(): Promise<{ created: number; skipped: number }> {
    const plans = await this.prisma.floorPlan.findMany();
    let created = 0;
    let skipped = 0;
    const kinds = new Set(['corridor', 'glass', 'elevator', 'staff']);

    for (const plan of plans) {
      const layout = Array.isArray(plan.layout) ? plan.layout : [];
      for (const el of layout as Array<Record<string, unknown>>) {
        const kind = String(el.kind ?? '');
        if (!kinds.has(kind)) continue;
        const label = String(el.label ?? el.name ?? kind).trim() || kind;
        const x = Number(el.x ?? 0);
        const y = Number(el.y ?? 0);
        const key = `${plan.floor}:${kind}:${label}:${x},${y}`;
        const existing = await this.prisma.publicArea.findUnique({ where: { key } });
        if (existing) {
          skipped += 1;
          continue;
        }
        await this.prisma.publicArea.create({
          data: {
            key,
            name: label,
            floor: plan.floor,
            kind: kind as PublicAreaKind,
            frequencyDays: 1,
          },
        });
        created += 1;
      }
    }
    return { created, skipped };
  }
}
