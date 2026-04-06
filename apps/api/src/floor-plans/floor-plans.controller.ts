import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpsertFloorPlanDto } from './dto/upsert-floor-plan.dto';
import { FloorPlansService } from './floor-plans.service';

@Controller('floor-plans')
@UseGuards(RolesGuard)
export class FloorPlansController {
  constructor(private readonly floorPlans: FloorPlansService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.RECEPTION)
  list() {
    return this.floorPlans.list();
  }

  @Get(':floor')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.RECEPTION)
  get(@Param('floor', ParseIntPipe) floor: number) {
    return this.floorPlans.get(floor);
  }

  @Put(':floor')
  @Roles(UserRole.ADMIN)
  upsert(
    @Param('floor', ParseIntPipe) floor: number,
    @Body() dto: UpsertFloorPlanDto,
    @CurrentUser() user: User,
  ) {
    return this.floorPlans.upsert(floor, dto, user);
  }
}
