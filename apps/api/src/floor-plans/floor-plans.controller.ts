import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { UpsertFloorPlanDto } from './dto/upsert-floor-plan.dto';
import { FloorPlansService } from './floor-plans.service';

@Controller('floor-plans')
export class FloorPlansController {
  constructor(private readonly floorPlans: FloorPlansService) {}

  @Get()
  @RequirePermissions(PermissionCode.FLOOR_PLAN_READ)
  list() {
    return this.floorPlans.list();
  }

  @Get(':floor')
  @RequirePermissions(PermissionCode.FLOOR_PLAN_READ)
  get(@Param('floor', ParseIntPipe) floor: number) {
    return this.floorPlans.get(floor);
  }

  @Put(':floor')
  @RequirePermissions(PermissionCode.FLOOR_PLAN_WRITE)
  upsert(
    @Param('floor', ParseIntPipe) floor: number,
    @Body() dto: UpsertFloorPlanDto,
    @CurrentUser() user: User,
  ) {
    return this.floorPlans.upsert(floor, dto, user);
  }
}
