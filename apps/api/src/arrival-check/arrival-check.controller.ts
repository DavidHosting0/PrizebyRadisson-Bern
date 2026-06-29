import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CheckInListTab } from '@housekeeping/shared';
import { ArrivalCheckService } from './arrival-check.service';
import { CreateArrivalCheckRunDto } from './dto/create-arrival-check-run.dto';

@Controller('arrival-check')
export class ArrivalCheckController {
  constructor(private readonly arrivalCheck: ArrivalCheckService) {}

  @Get('arrivals')
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  listArrivals(
    @Query('tab') tab: CheckInListTab = 'arrivals',
    @Query('q') q?: string,
    @Query('hotelId') hotelId?: string,
  ) {
    const normalized =
      tab === 'queue' || tab === 'checkInsDone' || tab === 'arrivals' ? tab : 'arrivals';
    return this.arrivalCheck.listCheckInTab(normalized, q, hotelId);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  syncArrivals(@Query('date') date?: string) {
    return this.arrivalCheck.syncArrivals(date);
  }

  @Post('runs')
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  createRun(@Body() dto: CreateArrivalCheckRunDto, @CurrentUser() user: User) {
    return this.arrivalCheck.createRun(
      user,
      dto.reservationIds,
      dto.hotelId,
      dto.forceRerun === true,
    );
  }

  @Get('runs')
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  listRuns() {
    return this.arrivalCheck.listRuns();
  }

  @Get('runs/:id')
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  getRun(@Param('id') id: string) {
    return this.arrivalCheck.getRun(id);
  }

  @Post('runs/:id/execute')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  executeRun(@Param('id') id: string) {
    return this.arrivalCheck.executeRun(id);
  }

  @Post('runs/:id/retry-failed')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  retryFailed(@Param('id') id: string) {
    return this.arrivalCheck.retryFailedItems(id);
  }

  @Post('runs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  cancelRun(@Param('id') id: string) {
    return this.arrivalCheck.cancelRun(id);
  }
}
