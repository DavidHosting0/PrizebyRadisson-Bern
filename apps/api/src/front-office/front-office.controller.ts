import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionCode, User, UserRole } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { FrontOfficeBackupService } from './front-office-backup.service';

@Controller('front-office')
export class FrontOfficeController {
  constructor(private readonly backup: FrontOfficeBackupService) {}

  @Get('backup-overview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  @RequirePermissions(PermissionCode.RESERVATIONS_READ)
  backupOverview(@CurrentUser() user: User, @Query('hotelId') hotelId?: string) {
    return this.backup.getOverview(user, hotelId);
  }
}
