import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { DeparturesService } from './departures.service';

@Controller('departures')
export class DeparturesController {
  constructor(private readonly departures: DeparturesService) {}

  @Get()
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  list(@Query('date') date?: string, @Query('hotelId') hotelId?: string) {
    return this.departures.listForDate(date, hotelId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RESERVATIONS_SYNC)
  refresh() {
    return this.departures.refreshFromEmma();
  }
}
