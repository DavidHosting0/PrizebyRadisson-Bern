import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { PermissionCode, UserRole } from '@prisma/client';
import { SettingsService } from './settings.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdatePuzzleLoginDto } from './dto/update-puzzle-login.dto';
import { UpdateEmmaLoginDto } from './dto/update-emma-login.dto';
import { RolesGuard } from '../common/guards/roles.guard';

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

  @Get('puzzle-login')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  puzzleLoginMeta() {
    return this.settings.getPuzzelLoginMeta();
  }

  @Patch('puzzle-login')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  patchPuzzleLogin(@Body() dto: UpdatePuzzleLoginDto) {
    return this.settings.updatePuzzelLogin(dto);
  }

  @Get('emma-login')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  emmaLoginMeta() {
    return this.settings.getEmmaLoginMeta();
  }

  @Patch('emma-login')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  patchEmmaLogin(@Body() dto: UpdateEmmaLoginDto) {
    return this.settings.updateEmmaLogin(dto);
  }
}
