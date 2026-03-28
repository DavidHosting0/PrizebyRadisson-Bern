import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { ChecklistsService } from './checklists.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateChecklistTaskDto } from './dto/update-checklist-task.dto';

@Controller('rooms/:roomId/checklist')
@UseGuards(RolesGuard)
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Patch('tasks/:taskId')
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.ADMIN)
  updateTask(
    @Param('roomId') roomId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateChecklistTaskDto,
  ) {
    return this.checklists.updateTask(roomId, taskId, user, dto);
  }

  @Post('reopen')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  reopen(@Param('roomId') roomId: string, @CurrentUser() user: User) {
    return this.checklists.reopen(roomId, user);
  }
}
