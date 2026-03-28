import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PutRoomTypeChecklistDto } from './dto/put-room-type-checklist.dto';
import { RoomTypesService } from './room-types.service';

@Controller('room-types')
@UseGuards(RolesGuard)
export class RoomTypesController {
  constructor(private readonly roomTypes: RoomTypesService) {}

  @Get()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  list() {
    return this.roomTypes.list();
  }

  @Get(':roomTypeId/checklist-template')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  getChecklistTemplate(@Param('roomTypeId') roomTypeId: string) {
    return this.roomTypes.getChecklistTemplate(roomTypeId);
  }

  @Put(':roomTypeId/checklist-template')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  putChecklistTemplate(
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: PutRoomTypeChecklistDto,
  ) {
    return this.roomTypes.putChecklistTemplate(roomTypeId, dto);
  }
}
