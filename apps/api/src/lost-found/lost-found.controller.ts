import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LostFoundStatus, PermissionCode, User } from '@prisma/client';
import { LostFoundService } from './lost-found.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreateLostFoundDto } from './dto/create-lost-found.dto';
import { PresignLostFoundDto } from './dto/presign-lost-found.dto';
import { UpdateLostFoundDto } from './dto/update-lost-found.dto';

@Controller('lost-found')
export class LostFoundController {
  constructor(private readonly lostFound: LostFoundService) {}

  @Get()
  @RequirePermissions(PermissionCode.LOST_FOUND_READ)
  list(@Query('status') status?: LostFoundStatus, @Query('q') q?: string) {
    return this.lostFound.list({ status, q });
  }

  @Post('presign')
  @RequirePermissions(PermissionCode.LOST_FOUND_CREATE)
  presign(@Body() dto: PresignLostFoundDto, @CurrentUser() user: User) {
    return this.lostFound.presign(user, dto.roomId, dto.contentType);
  }

  @Post()
  @RequirePermissions(PermissionCode.LOST_FOUND_CREATE)
  create(@Body() dto: CreateLostFoundDto, @CurrentUser() user: User) {
    return this.lostFound.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.LOST_FOUND_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateLostFoundDto, @CurrentUser() user: User) {
    return this.lostFound.update(id, dto, user);
  }
}
