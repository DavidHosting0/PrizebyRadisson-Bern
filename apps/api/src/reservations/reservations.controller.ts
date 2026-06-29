import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionCode, UserRole } from '@prisma/client';
import type { ReservationTab } from '@housekeeping/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { MoveFolioChargeDto } from './dto/move-folio-charge.dto';
import { ReservationsAnalyticsService } from './reservations-analytics.service';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly analytics: ReservationsAnalyticsService,
  ) {}

  @Get('analytics/timeline')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  analyticsTimeline(@Query('date') date?: string) {
    return this.analytics.timeline(date);
  }

  @Get('analytics/check-in-rate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  analyticsCheckInRate(
    @Query('date') date?: string,
    @Query('bucketMinutes') bucketMinutes?: string,
  ) {
    const bucket = bucketMinutes ? parseInt(bucketMinutes, 10) : 15;
    return this.analytics.checkInRate(date, Number.isFinite(bucket) ? bucket : 15);
  }

  @Get('analytics/daily-summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  analyticsDailySummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.dailySummary(from, to);
  }

  @Get('analytics/breakdown')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  analyticsBreakdown(@Query('date') date?: string) {
    return this.analytics.breakdown(date);
  }

  @Get()
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  list(
    @Query('tab') tab: ReservationTab = 'arrivals',
    @Query('date') date?: string,
    @Query('q') q?: string,
    @Query('hotelId') hotelId?: string,
  ) {
    const normalized =
      tab === 'queue' || tab === 'inhouse' || tab === 'arrivals' || tab === 'checkInsDone' || tab === 'all'
        ? tab
        : 'arrivals';
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

  @Post(':reservationId/fetch-detail')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RESERVATIONS_SYNC)
  fetchDetail(@Param('reservationId') reservationId: string, @Query('hotelId') hotelId?: string) {
    return this.reservations.fetchDetailFromEmma(reservationId, hotelId);
  }

  @Post(':reservationId/fetch-folio')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RESERVATIONS_SYNC)
  fetchFolio(@Param('reservationId') reservationId: string, @Query('hotelId') hotelId?: string) {
    return this.reservations.fetchFolioFromEmma(reservationId, hotelId);
  }

  @Post(':reservationId/move-folio-charge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RESERVATIONS_SYNC)
  moveFolioCharge(
    @Param('reservationId') reservationId: string,
    @Body() dto: MoveFolioChargeDto,
  ) {
    return this.reservations.moveFolioChargeFromEmma(reservationId, dto);
  }

  @Get(':reservationId')
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  detail(@Param('reservationId') reservationId: string, @Query('hotelId') hotelId?: string) {
    return this.reservations.findOne(reservationId, hotelId);
  }
}
