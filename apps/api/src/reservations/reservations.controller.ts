import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import type { ReservationTab } from '@housekeeping/shared';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  list(
    @Query('tab') tab: ReservationTab = 'arrivals',
    @Query('date') date?: string,
    @Query('q') q?: string,
    @Query('hotelId') hotelId?: string,
  ) {
    const normalized =
      tab === 'queue' || tab === 'inhouse' || tab === 'arrivals' ? tab : 'arrivals';
    return this.reservations.list({ tab: normalized, date, q, hotelId });
  }

  @Get('overview')
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  overview(@Query('hotelId') hotelId?: string) {
    return this.reservations.overview(hotelId);
  }

  @Get('sync-status')
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  syncStatus() {
    return this.reservations.syncStatus();
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RESERVATIONS_SYNC)
  sync(@Query('date') date?: string) {
    return this.reservations.syncFromEmma(date);
  }

  @Get(':reservationId')
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  detail(@Param('reservationId') reservationId: string, @Query('hotelId') hotelId?: string) {
    return this.reservations.findOne(reservationId, hotelId);
  }
}
