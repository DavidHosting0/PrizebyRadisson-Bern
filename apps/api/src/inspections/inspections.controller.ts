import { Body, Controller, Post } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { InspectionsService } from './inspections.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreateInspectionDto } from './dto/create-inspection.dto';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Post()
  @RequirePermissions(PermissionCode.INSPECTION_CREATE)
  create(@Body() dto: CreateInspectionDto, @CurrentUser() user: User) {
    return this.inspections.create(dto, user);
  }
}
