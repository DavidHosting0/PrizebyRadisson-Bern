import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArrivalCheckService } from './arrival-check.service';
import { CreateArrivalCheckRunDto } from './dto/create-arrival-check-run.dto';

@Controller('arrival-check')
export class ArrivalCheckController {
  constructor(private readonly arrivalCheck: ArrivalCheckService) {}

  @Post('runs')
  @RequirePermissions(PermissionCode.RESERVATIONS_SYNC)
  createRun(@Body() dto: CreateArrivalCheckRunDto, @CurrentUser() user: User) {
    return this.arrivalCheck.createRun(user, dto.reservationIds, dto.hotelId);
  }

  @Get('runs')
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  listRuns() {
    return this.arrivalCheck.listRuns();
  }

  @Get('runs/:id')
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  getRun(@Param('id') id: string) {
    return this.arrivalCheck.getRun(id);
  }
}
