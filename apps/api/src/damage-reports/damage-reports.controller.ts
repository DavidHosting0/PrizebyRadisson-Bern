import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionCode, RoomDamageReportStatus, User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreateDamageReportDto } from './dto/create-damage-report.dto';
import { PresignDamageReportDto } from './dto/presign-damage-report.dto';
import { UpdateDamageReportDto } from './dto/update-damage-report.dto';
import { DamageReportsService } from './damage-reports.service';

@Controller('damage-reports')
export class DamageReportsController {
  constructor(private readonly damageReports: DamageReportsService) {}

  @Get()
  @RequirePermissions(PermissionCode.DAMAGE_REPORT_READ)
  list(@Query('status') status?: RoomDamageReportStatus, @Query('q') q?: string) {
    return this.damageReports.list({ status, q });
  }

  @Post('presign')
  @RequirePermissions(PermissionCode.DAMAGE_REPORT_CREATE)
  presign(@Body() dto: PresignDamageReportDto, @CurrentUser() user: User) {
    return this.damageReports.presign(user, dto.roomId, dto.contentType);
  }

  @Post()
  @RequirePermissions(PermissionCode.DAMAGE_REPORT_CREATE)
  create(@Body() dto: CreateDamageReportDto, @CurrentUser() user: User) {
    return this.damageReports.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.DAMAGE_REPORT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateDamageReportDto) {
    return this.damageReports.update(id, dto);
  }
}
