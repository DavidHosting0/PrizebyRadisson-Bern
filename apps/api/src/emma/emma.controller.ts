import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { EmmaService } from './emma.service';

/**
 * EMMA runs only on authenticated requests (Admin/Reception). No schedulers;
 * HTTP session + OData sync are explicit API calls.
 */
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RECEPTION, UserRole.SUPERVISOR)
  syncRoomStatuses(
    @Body() body: { hotelId?: string; forceAttempt?: boolean } | undefined,
  ) {
    return this.emma.syncRoomStatuses(body ?? {});
  }
}
