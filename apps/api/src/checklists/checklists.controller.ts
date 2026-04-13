import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { ChecklistsService } from './checklists.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { UpdateChecklistTaskDto } from './dto/update-checklist-task.dto';

@Controller('rooms/:roomId/checklist')
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Patch('tasks/:taskId')
  @RequirePermissions(PermissionCode.CHECKLIST_TASK_UPDATE)
  updateTask(
    @Param('roomId') roomId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateChecklistTaskDto,
  ) {
    return this.checklists.updateTask(roomId, taskId, user, dto);
  }

  @Post('reopen')
  @RequirePermissions(PermissionCode.CHECKLIST_REOPEN)
  reopen(@Param('roomId') roomId: string, @CurrentUser() user: User) {
    return this.checklists.reopen(roomId, user);
  }
}
