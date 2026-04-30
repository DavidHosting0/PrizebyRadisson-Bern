import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { FavurService } from './favur.service';
import { FavurApiKeyGuard } from './favur-api-key.guard';
import {
  ImportCaptureDto,
  MapFavurUserDto,
  UpdateFavurConfigDto,
} from './dto/favur.dto';

@Controller('favur')
export class FavurController {
  constructor(private readonly favur: FavurService) {}

  // ---------- admin (JWT) ----------

  @Get('config')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  config() {
    return this.favur.getConfig();
  }

  @Put('config')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  updateConfig(@Body() dto: UpdateFavurConfigDto) {
    return this.favur.updateConfig(dto);
  }

  /** Returns the API key in plaintext (one-time). UI lets admin copy it. */
  @Post('api-key')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  regenerateApiKey() {
    return this.favur.regenerateApiKey();
  }

  @Get('captures')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  captures() {
    return this.favur.listCaptures();
  }

  @Get('captures/:id')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  capture(@Param('id') id: string) {
    return this.favur.getCaptureSample(id);
  }

  @Post('captures/:id/activate')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  activate(@Param('id') id: string) {
    return this.favur.activateCapture(id);
  }

  @Delete('captures/:id')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCapture(@Param('id') id: string) {
    await this.favur.deleteCapture(id);
  }

  @Get('users')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  users() {
    return this.favur.listFavurUsers();
  }

  @Put('users/:id')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  mapUser(@Param('id') id: string, @Body() dto: MapFavurUserDto) {
    return this.favur.setFavurUserMapping(id, dto.userId ?? null);
  }

  @Post('sync')
  @RequirePermissions(PermissionCode.SHIFT_MANAGE)
  sync() {
    return this.favur.syncNow('manual');
  }

  // ---------- extension (API-Key) ----------

  /**
   * Browser extension hits this endpoint with every captured Favur API call.
   * Auth is via the per-tenant API key, NOT a user JWT — we mark it Public so
   * the global JwtAuthGuard skips it, then run our own FavurApiKeyGuard.
   */
  @Post('import')
  @Public()
  @UseGuards(FavurApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  importCapture(@Body() dto: ImportCaptureDto) {
    return this.favur.importCapture(dto);
  }
}
