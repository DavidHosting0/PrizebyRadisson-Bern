import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PutShiftHandoverTemplateDto } from './dto/put-shift-handover-template.dto';
import { ShiftHandoverHandoverDto } from './dto/shift-handover-handover.dto';
import { UpdateShiftHandoverTaskDto } from './dto/update-shift-handover-task.dto';
import { ShiftHandoverService } from './shift-handover.service';

@Controller('shift-handover')
export class ShiftHandoverController {
  constructor(private readonly shiftHandover: ShiftHandoverService) {}

  @Get()
  @RequirePermissions(PermissionCode.SHIFT_HANDOVER_READ)
  getState() {
    return this.shiftHandover.getState();
  }

  @Get('templates')
  @RequirePermissions(PermissionCode.SHIFT_HANDOVER_WRITE)
  listTemplates() {
    return this.shiftHandover.listTemplates();
  }

  @Put('templates/:shift')
  @RequirePermissions(PermissionCode.SHIFT_HANDOVER_WRITE)
  putTemplate(@Param('shift') shift: string, @Body() dto: PutShiftHandoverTemplateDto) {
    return this.shiftHandover.putTemplate(shift, dto);
  }

  @Get('log')
  @RequirePermissions(PermissionCode.SHIFT_HANDOVER_READ)
  listLog(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 20;
    return this.shiftHandover.listLog(Number.isFinite(n) ? n : 20);
  }

  @Patch('tasks/:taskId')
  @RequirePermissions(PermissionCode.SHIFT_HANDOVER_READ)
  updateTask(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateShiftHandoverTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shiftHandover.updateTask(taskId, dto.completed, user);
  }

  @Post('handover')
  @RequirePermissions(PermissionCode.SHIFT_HANDOVER_READ)
  handover(@Body() dto: ShiftHandoverHandoverDto, @CurrentUser() user: AuthenticatedUser) {
    return this.shiftHandover.handover(dto, user);
  }
}
