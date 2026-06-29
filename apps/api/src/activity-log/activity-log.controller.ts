import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActivityLogCategory, PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ACTIVITY_CATEGORY_LABELS } from './action-resolver';
import { ActivityLogService } from './activity-log.service';

@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLogService) {}

  @Get()
  @RequirePermissions(PermissionCode.ACTIVITY_LOG_READ)
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('category') category?: ActivityLogCategory,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('success') success?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityLog.list({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      actorUserId: actorUserId || undefined,
      category,
      action: action || undefined,
      resourceType: resourceType || undefined,
      resourceId: resourceId || undefined,
      success: success === 'true' ? true : success === 'false' ? false : undefined,
      search: search || undefined,
      cursor: cursor || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('summary')
  @RequirePermissions(PermissionCode.ACTIVITY_LOG_READ)
  summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 7 * 86400_000);
    return this.activityLog.summary(start, end);
  }

  @Get('categories')
  @RequirePermissions(PermissionCode.ACTIVITY_LOG_READ)
  categories() {
    return {
      categories: Object.entries(ACTIVITY_CATEGORY_LABELS).map(([code, label]) => ({
        code,
        label,
      })),
    };
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.ACTIVITY_LOG_READ)
  detail(@Param('id') id: string) {
    return this.activityLog.getById(id);
  }
}
