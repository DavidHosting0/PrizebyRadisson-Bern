import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

@Controller('assignments')
@UseGuards(RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.RECEPTION)
  list() {
    return this.assignments.list();
  }

  @Post()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: User) {
    return this.assignments.manualAssign(dto.roomId, dto.housekeeperUserId, user);
  }

  @Post('suggestions')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  suggestions() {
    return this.assignments.suggestions();
  }

  @Post('run-auto')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  runAuto() {
    return this.assignments.runAutoAssignment();
  }
}
