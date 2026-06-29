import { Controller, Get, Param, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { RoomManagementService } from './room-management.service';

@Controller('room-management')
export class RoomManagementController {
  constructor(private readonly roomManagement: RoomManagementService) {}

  @Get('rooms/:roomId')
  @RequirePermissions(PermissionCode.ROOM_MANAGEMENT_READ)
  getRoomDetail(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.roomManagement.getDetail(roomId, user, { from, to });
  }
}
