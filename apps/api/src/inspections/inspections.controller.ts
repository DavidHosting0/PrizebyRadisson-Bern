import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { InspectionsService } from './inspections.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateInspectionDto } from './dto/create-inspection.dto';

@Controller('inspections')
@UseGuards(RolesGuard)
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Post()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  create(@Body() dto: CreateInspectionDto, @CurrentUser() user: User) {
    return this.inspections.create(dto, user);
  }
}
