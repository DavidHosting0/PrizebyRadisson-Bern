import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { BreakfastService } from './breakfast.service';
import {
  CreateBreakfastWishDto,
  ServeBreakfastEntryDto,
  UpdateBreakfastWishDto,
  UpsertBreakfastEntryDto,
} from './dto/breakfast.dto';

@Controller('breakfast')
export class BreakfastController {
  constructor(private readonly breakfast: BreakfastService) {}

  @Get('today')
  @RequirePermissions(PermissionCode.BREAKFAST_READ)
  today(@Query('date') date?: string) {
    return this.breakfast.today(date);
  }

  @Get('forecast')
  @RequirePermissions(PermissionCode.BREAKFAST_READ)
  forecast(@Query('from') from?: string, @Query('to') to?: string) {
    return this.breakfast.forecast(from, to);
  }

  @Post('entries')
  @RequirePermissions(PermissionCode.BREAKFAST_WRITE)
  upsertEntry(
    @Body() dto: UpsertBreakfastEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.breakfast.upsertEntry(dto, user);
  }

  @Patch('entries/:id/serve')
  @RequirePermissions(PermissionCode.BREAKFAST_WRITE)
  setServed(
    @Param('id') id: string,
    @Body() dto: ServeBreakfastEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.breakfast.setServed(id, dto, user);
  }

  @Get('wishes')
  @RequirePermissions(PermissionCode.BREAKFAST_WISHES_READ)
  listWishes(
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.breakfast.listWishes({ date, status, roomId });
  }

  @Post('wishes')
  @RequirePermissions(PermissionCode.BREAKFAST_WISHES_WRITE)
  createWish(
    @Body() dto: CreateBreakfastWishDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.breakfast.createWish(dto, user);
  }

  @Patch('wishes/:id')
  @RequirePermissions(PermissionCode.BREAKFAST_WISHES_WRITE)
  updateWish(@Param('id') id: string, @Body() dto: UpdateBreakfastWishDto) {
    return this.breakfast.updateWish(id, dto);
  }

  @Delete('wishes/:id')
  @RequirePermissions(PermissionCode.BREAKFAST_WISHES_WRITE)
  deleteWish(@Param('id') id: string) {
    return this.breakfast.deleteWish(id);
  }
}
