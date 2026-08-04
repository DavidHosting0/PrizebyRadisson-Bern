import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateComplaintDto, UpdateComplaintDto } from './dto/complaint.dto';
import { ComplaintsService } from './complaints.service';

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @RequirePermissions(PermissionCode.COMPLAINTS_READ)
  list(
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.complaints.list({ category, status, roomId });
  }

  @Get('heatmap')
  @RequirePermissions(PermissionCode.COMPLAINTS_READ)
  heatmap() {
    return this.complaints.heatmap();
  }

  @Post()
  @RequirePermissions(PermissionCode.COMPLAINTS_WRITE)
  create(@Body() dto: CreateComplaintDto, @CurrentUser() user: AuthenticatedUser) {
    return this.complaints.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.COMPLAINTS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateComplaintDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.complaints.update(id, dto, user);
  }
}
