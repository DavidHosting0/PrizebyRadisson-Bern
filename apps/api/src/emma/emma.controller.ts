import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PermissionCode, User, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EmmaService } from './emma.service';
@Controller('emma')
export class EmmaController {
  constructor(private readonly emma: EmmaService) {}

  @Get('login')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  loginMeta() {
    return this.emma.getLoginMeta();
  }

  @Post('session/invalidate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  invalidate() {
    return this.emma.invalidateSession();
  }

  /**
   * HTTP login (ADFS+MFA+SAP) — stores session cookies for fast sync.
   * Run after credential changes or when sync returns session errors (~30–60s).
   */
  @Post('session/refresh-http')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  refreshHttpSession() {
    return this.emma.refreshHttpSession();
  }

  /**
   * Prüft nur die gespeicherten Cookies gegen ZEYUI_RSRVS_SRV (CSRF Fetch).
   * Kein ADFS/SAP-Login; nützlich um zu sehen, ob Zimmer-Sync überhaupt möglich ist.
   */
  @Get('session/probe')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  probeStoredSession() {
    return this.emma.probeStoredHttpSession();
  }

  /**
   * Fast OData sync (few HTTP requests, typically a few seconds).
   * `forceAttempt: true` — keine Probe und kein auto refresh-http; nur für Tests,
   * wenn die Session noch gültig sein könnte, refresh-http aber fehlschlägt.
   */
  @Post('room-status/sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RESERVATIONS_SYNC)
  syncRoomStatuses(
    @Body() body: { hotelId?: string; forceAttempt?: boolean } | undefined,
  ) {
    return this.emma.syncRoomStatuses(body ?? {});
  }

  @Get('integration-status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  integrationStatus() {
    return this.emma.getIntegrationStatus();
  }

  @Patch('backup-mode')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  setBackupMode(@Body() body: { manual: boolean }, @CurrentUser() user: User) {
    return this.emma.setBackupModeManual(body.manual === true, user.id);
  }
}
