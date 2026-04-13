import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { SettingsService } from './settings.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermissions(PermissionCode.SETTINGS_WRITE)
  patch(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}
