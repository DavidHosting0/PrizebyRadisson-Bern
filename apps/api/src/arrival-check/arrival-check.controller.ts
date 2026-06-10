import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArrivalCheckService } from './arrival-check.service';
import { CreateArrivalCheckRunDto } from './dto/create-arrival-check-run.dto';

@Controller('arrival-check')
export class ArrivalCheckController {
  constructor(private readonly arrivalCheck: ArrivalCheckService) {}

  @Get('arrivals')
  @RequirePermissions(PermissionCode.ARRIVAL_CHECK)
  listArrivals(@Query('q') q?: string, @Query('hotelId') hotelId?: string) {
    return this.arrivalCheck.listArrivals(q, hotelId);
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
    return this.arrivalCheck.createRun(user, dto.reservationIds, dto.hotelId);
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
}
