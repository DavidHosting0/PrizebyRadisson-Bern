import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { RoomsService } from './rooms.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateRoomDto } from './dto/update-room.dto';

@Controller('rooms')
@UseGuards(RolesGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.RECEPTION, UserRole.ADMIN)
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
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.RECEPTION, UserRole.ADMIN)
  findOne(@Param('roomId') roomId: string) {
    return this.rooms.findOne(roomId);
  }

  @Patch(':roomId')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  update(@Param('roomId') roomId: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.updateRoom(roomId, dto);
  }
}
