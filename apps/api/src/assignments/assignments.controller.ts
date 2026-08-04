import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { DailyCleaningService } from './daily-cleaning.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { PatchDailyTaskDto } from './dto/patch-daily-task.dto';
import { SkipRoomDto } from './dto/skip-room.dto';
import { LateShiftOverrideDto } from './dto/late-shift-override.dto';

@Controller('assignments')
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly daily: DailyCleaningService,
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

  @Post('daily-plan/suggest')
  @RequirePermissions(PermissionCode.ASSIGNMENT_SUGGESTIONS)
  suggest(@Query('date') date?: string) {
    return this.daily.suggest(date);
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
  completePublic(@Param('id') id: string, @CurrentUser() user: User) {
    return this.daily.completePublicTask(id, user);
  }

  @Post()
  @RequirePermissions(PermissionCode.ASSIGNMENT_CREATE)
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: User) {
    return this.assignments.manualAssign(dto.roomId, dto.housekeeperUserId, user);
  }

  @Post('suggestions')
  @RequirePermissions(PermissionCode.ASSIGNMENT_SUGGESTIONS)
  suggestions(@Query('date') date?: string) {
    return this.assignments.suggestions(date);
  }

  @Post('run-auto')
  @RequirePermissions(PermissionCode.ASSIGNMENT_RUN_AUTO)
  runAuto(@Query('date') date?: string, @CurrentUser() user?: User) {
    return this.assignments.runAutoAssignment(date, user);
  }
}
