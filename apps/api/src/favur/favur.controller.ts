import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { FavurService } from './favur.service';
import { MapFavurUserDto, UpdateFavurConfigDto } from './dto/favur.dto';

@Controller('favur')
export class FavurController {
  constructor(private readonly favur: FavurService) {}

  @Get('config')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  config() {
    return this.favur.getConfig();
  }

  @Put('config')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  updateConfig(@Body() dto: UpdateFavurConfigDto) {
    return this.favur.updateConfig(dto);
  }

  @Get('users')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  users() {
    return this.favur.listFavurUsers();
  }

  @Put('users/:id')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  mapUser(@Param('id') id: string, @Body() dto: MapFavurUserDto) {
    return this.favur.setFavurUserMapping(id, dto.userId ?? null);
  }

  @Post('sync')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  sync() {
    return this.favur.syncNow('manual');
  }
}
