import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { MirusService } from './mirus.service';
import { MapMirusUserDto, UpdateMirusConfigDto } from './dto/mirus.dto';

@Controller('mirus')
export class MirusController {
  constructor(private readonly mirus: MirusService) {}

  @Get('config')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  config() {
    return this.mirus.getConfig();
  }

  @Put('config')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  updateConfig(@Body() dto: UpdateMirusConfigDto) {
    return this.mirus.updateConfig(dto);
  }

  @Get('users')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  users() {
    return this.mirus.listUsers();
  }

  /** Deletes legacy Favur numeric IDs and date-junk rows from the mapping list. */
  @Post('users/purge-legacy')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  purgeLegacy() {
    return this.mirus.purgeLegacyEmployees();
  }

  @Put('users/:id')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  mapUser(@Param('id') id: string, @Body() dto: MapMirusUserDto) {
    return this.mirus.setUserMapping(id, dto.userId ?? null);
  }

  @Post('sync')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  sync() {
    return this.mirus.syncNow('manual');
  }

  @Post('sync/unlock')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  unlockSync() {
    return this.mirus.unlockSync();
  }
}
