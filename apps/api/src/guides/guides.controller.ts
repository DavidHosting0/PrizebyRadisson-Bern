import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateGuideDto } from './dto/create-guide.dto';
import { ReorderGuidesDto } from './dto/reorder-guides.dto';
import { UpdateGuideDto } from './dto/update-guide.dto';
import { GuidesService } from './guides.service';

@Controller('guides')
export class GuidesController {
  constructor(private readonly guides: GuidesService) {}

  @Get()
  @RequirePermissions(PermissionCode.GUIDE_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query('all') all?: string) {
    return this.guides.list(user, all === 'true');
  }

  @Patch('reorder')
  @RequirePermissions(PermissionCode.GUIDE_WRITE)
  reorder(@Body() dto: ReorderGuidesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guides.reorder(dto, user);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.GUIDE_READ)
  getById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.guides.getById(id, user);
  }

  @Post()
  @RequirePermissions(PermissionCode.GUIDE_WRITE)
  create(@Body() dto: CreateGuideDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guides.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.GUIDE_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGuideDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.guides.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.GUIDE_WRITE)
  remove(@Param('id') id: string) {
    return this.guides.remove(id);
  }
}
