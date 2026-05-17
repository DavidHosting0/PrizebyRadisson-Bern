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

  /** Fast OData sync (few HTTP requests, typically a few seconds). */
  @Post('room-status/sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RECEPTION, UserRole.SUPERVISOR)
  syncRoomStatuses(@Body() body: { hotelId?: string } | undefined) {
    return this.emma.syncRoomStatuses(body ?? {});
  }
}
