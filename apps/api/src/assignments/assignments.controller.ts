import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { DailyCleaningService } from './daily-cleaning.service';
import { InspectionQueueService } from './inspection-queue.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { PatchDailyTaskDto } from './dto/patch-daily-task.dto';
import { SkipRoomDto } from './dto/skip-room.dto';
import { LateShiftOverrideDto } from './dto/late-shift-override.dto';
import { RunAutoAssignDto } from './dto/run-auto-assign.dto';

@Controller('assignments')
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly daily: DailyCleaningService,
    private readonly inspectionQueue: InspectionQueueService,
  ) {}

  @Get()
  @RequirePermissions(PermissionCode.ASSIGNMENT_READ)
  list() {
    return this.assignments.list();
  }

  @Get('daily-plan')
  @RequirePermissions(PermissionCode.ASSIGNMENT_READ)
  dailyPlan(@Query('date') date?: string) {
    return this.daily.getDailyPlan(date);
  }

  @Get('my-daily-tasks')
  @RequirePermissions(PermissionCode.ROOMS_READ)
  myDailyTasks(@CurrentUser() user: User) {
    return this.daily.myDailyTasks(user);
  }

  @Get('my-inspection-tasks')
  @RequirePermissions(PermissionCode.ROOMS_READ)
  myInspectionTasks(@CurrentUser() user: User, @Query('date') date?: string) {
    return this.inspectionQueue.listQueueForUser(user, date);
  }

  @Post('inspection-tasks/:id/claim')
  @RequirePermissions(PermissionCode.ROOMS_READ)
  claimInspection(@Param('id') id: string, @CurrentUser() user: User) {
    return this.inspectionQueue.claim(id, user);
  }

  @Post('inspection-tasks/:id/release')
  @RequirePermissions(PermissionCode.ROOMS_READ)
  releaseInspection(@Param('id') id: string, @CurrentUser() user: User) {
    return this.inspectionQueue.release(id, user);
  }

  @Post('daily-plan/suggest')
  @RequirePermissions(PermissionCode.ASSIGNMENT_SUGGESTIONS)
  suggest(@Query('date') date?: string, @CurrentUser() user?: User) {
    return this.daily.runAutoAssign(date, {}, user);
  }

  @Post('daily-plan/run')
  @RequirePermissions(PermissionCode.ASSIGNMENT_RUN_AUTO)
  run(@Body() dto: RunAutoAssignDto, @CurrentUser() user: User) {
    return this.daily.runAutoAssign(
      dto.date,
      {
        workingTodayUserIds: dto.workingTodayUserIds,
        restantAssigneeUserId: dto.restantAssigneeUserId,
        lateShiftUserIds: dto.lateShiftUserIds,
        publicAssigneeUserIds: dto.publicAssigneeUserIds,
        inspectorUserIds: dto.inspectorUserIds,
      },
      user,
    );
  }

  @Post('daily-plan/save')
  @RequirePermissions(PermissionCode.ASSIGNMENT_RUN_AUTO)
  save(@Query('date') date?: string, @CurrentUser() user?: User) {
    return this.daily.save(date, user!);
  }

  @Patch('daily-plan/tasks/:id')
  @RequirePermissions(PermissionCode.ASSIGNMENT_CREATE)
  patchTask(
    @Param('id') id: string,
    @Body() dto: PatchDailyTaskDto,
    @CurrentUser() user: User,
  ) {
    return this.daily.patchTask(id, dto, user);
  }

  @Post('daily-plan/skip')
  @RequirePermissions(PermissionCode.ASSIGNMENT_CREATE)
  skip(@Body() dto: SkipRoomDto, @CurrentUser() user: User) {
    return this.daily.skipRoom(dto.roomId, dto.date, user);
  }

  @Delete('daily-plan/skip/:roomId')
  @RequirePermissions(PermissionCode.ASSIGNMENT_CREATE)
  unskip(
    @Param('roomId') roomId: string,
    @Query('date') date: string | undefined,
    @CurrentUser() user: User,
  ) {
    return this.daily.unskipRoom(roomId, date, user);
  }

  @Patch('daily-plan/late-shift')
  @RequirePermissions(PermissionCode.ASSIGNMENT_CREATE)
  lateShift(@Body() dto: LateShiftOverrideDto, @CurrentUser() user: User) {
    return this.daily.setLateShiftOverride(dto, user);
  }

  @Post('daily-plan/tasks/:id/complete')
  @RequirePermissions(PermissionCode.ROOMS_READ)
  completeTask(@Param('id') id: string, @CurrentUser() user: User) {
    return this.daily.completeDailyTask(id, user);
  }

  @Post()
  @RequirePermissions(PermissionCode.ASSIGNMENT_CREATE)
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: User) {
    return this.assignments.manualAssign(dto.roomId, dto.housekeeperUserId, user);
  }

  @Delete('room/:roomId')
  @RequirePermissions(PermissionCode.ASSIGNMENT_CREATE)
  unassign(@Param('roomId') roomId: string, @CurrentUser() user: User) {
    return this.daily.unassignRoom(roomId, user);
  }

  @Post('suggestions')
  @RequirePermissions(PermissionCode.ASSIGNMENT_SUGGESTIONS)
  suggestions(@Query('date') date?: string, @CurrentUser() user?: User) {
    return this.assignments.suggestions(date, user);
  }

  @Post('run-auto')
  @RequirePermissions(PermissionCode.ASSIGNMENT_RUN_AUTO)
  runAuto(@Query('date') date?: string, @CurrentUser() user?: User) {
    return this.assignments.runAutoAssignment(date, user);
  }
}
