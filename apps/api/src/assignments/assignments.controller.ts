import { Body, Controller, Get, Post } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @RequirePermissions(PermissionCode.ASSIGNMENT_READ)
  list() {
    return this.assignments.list();
  }

  @Post()
  @RequirePermissions(PermissionCode.ASSIGNMENT_CREATE)
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: User) {
    return this.assignments.manualAssign(dto.roomId, dto.housekeeperUserId, user);
  }

  @Post('suggestions')
  @RequirePermissions(PermissionCode.ASSIGNMENT_SUGGESTIONS)
  suggestions() {
    return this.assignments.suggestions();
  }

  @Post('run-auto')
  @RequirePermissions(PermissionCode.ASSIGNMENT_RUN_AUTO)
  runAuto() {
    return this.assignments.runAutoAssignment();
  }
}
