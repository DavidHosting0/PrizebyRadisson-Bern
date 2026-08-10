import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RoomsService } from './rooms.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UpdateRoomDto } from './dto/update-room.dto';
import { SetRoomStatusDto } from './dto/set-room-status.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @RequirePermissions(PermissionCode.ROOMS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('floor') floor?: string,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ) {
    return this.rooms.findAll(user, {
      floor: floor != null ? parseInt(floor, 10) : undefined,
      status,
      mine: mine === '1' || mine === 'true',
    });
  }

  @Post(':roomId/mark-clean')
  @RequirePermissions(PermissionCode.CHECKLIST_TASK_UPDATE)
  markClean(@Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rooms.markHousekeepingClean(roomId, user);
  }

  @Post(':roomId/status')
  @RequirePermissions(PermissionCode.ROOM_STATUS_WRITE)
  setStatus(
    @Param('roomId') roomId: string,
    @Body() dto: SetRoomStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rooms.setRoomStatus(roomId, dto.status, user);
  }

  @Get(':roomId')
  @RequirePermissions(PermissionCode.ROOMS_READ)
  findOne(@Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rooms.findOne(roomId, user);
  }

  @Patch(':roomId')
  @RequirePermissions(PermissionCode.ROOMS_UPDATE)
  update(@Param('roomId') roomId: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.updateRoom(roomId, dto);
  }
}
