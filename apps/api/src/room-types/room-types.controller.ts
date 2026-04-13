import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PutRoomTypeChecklistDto } from './dto/put-room-type-checklist.dto';
import { RoomTypesService } from './room-types.service';

@Controller('room-types')
export class RoomTypesController {
  constructor(private readonly roomTypes: RoomTypesService) {}

  @Get()
  @RequirePermissions(PermissionCode.ROOM_TYPE_READ)
  list() {
    return this.roomTypes.list();
  }

  @Get(':roomTypeId/checklist-template')
  @RequirePermissions(PermissionCode.ROOM_TYPE_READ)
  getChecklistTemplate(@Param('roomTypeId') roomTypeId: string) {
    return this.roomTypes.getChecklistTemplate(roomTypeId);
  }

  @Put(':roomTypeId/checklist-template')
  @RequirePermissions(PermissionCode.ROOM_TYPE_WRITE)
  putChecklistTemplate(
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: PutRoomTypeChecklistDto,
  ) {
    return this.roomTypes.putChecklistTemplate(roomTypeId, dto);
  }
}
