import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { RoomsService } from './rooms.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { UpdateRoomDto } from './dto/update-room.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @RequirePermissions(PermissionCode.ROOMS_READ)
  findAll(
    @CurrentUser() user: User,
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

  @Get(':roomId')
  @RequirePermissions(PermissionCode.ROOMS_READ)
  findOne(@Param('roomId') roomId: string) {
    return this.rooms.findOne(roomId);
  }

  @Patch(':roomId')
  @RequirePermissions(PermissionCode.ROOMS_UPDATE)
  update(@Param('roomId') roomId: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.updateRoom(roomId, dto);
  }
}
