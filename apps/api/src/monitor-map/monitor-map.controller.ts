import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PermissionCode, UserRole } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { MonitorMapService } from './monitor-map.service';

@Controller('monitor-map')
export class MonitorMapController {
  constructor(private readonly monitorMap: MonitorMapService) {}

  @Get('snapshot')
  @RequirePermissions(PermissionCode.MONITOR_MAP_READ)
  snapshot() {
    return this.monitorMap.getSnapshot();
  }

  @Get('admin/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminStatus() {
    return this.monitorMap.getAdminStatus();
  }

  @Get('admin/feeds')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  listFeeds() {
    return this.monitorMap.listFeedSources();
  }

  @Post('admin/feeds')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  createFeed(
    @Body()
    body: { kind: 'NEWS' | 'POLICE'; name: string; feedUrl: string; enabled?: boolean },
  ) {
    return this.monitorMap.createFeedSource(body);
  }

  @Patch('admin/feeds/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateFeed(
    @Param('id') id: string,
    @Body() body: { name?: string; feedUrl?: string; enabled?: boolean },
  ) {
    return this.monitorMap.updateFeedSource(id, body);
  }

  @Delete('admin/feeds/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteFeed(@Param('id') id: string) {
    return this.monitorMap.deleteFeedSource(id);
  }

  @Post('admin/sync')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async syncNow() {
    const result = await this.monitorMap.syncFeeds();
    await this.monitorMap.refreshAviation().catch(() => undefined);
    return { ok: true, ...result };
  }
}
