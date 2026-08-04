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
import { PermissionCode, PublicAreaKind } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PublicAreasService } from './daily-cleaning.service';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

class CreatePublicAreaDto {
  @IsString()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number | null;

  @IsEnum(PublicAreaKind)
  kind!: PublicAreaKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  frequencyDays?: number;

  @IsOptional()
  @IsString()
  key?: string;
}

class UpdatePublicAreaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number | null;

  @IsOptional()
  @IsEnum(PublicAreaKind)
  kind?: PublicAreaKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  frequencyDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  lastCompletedOn?: string | null;
}

@Controller('public-areas')
export class PublicAreasController {
  constructor(private readonly publicAreas: PublicAreasService) {}

  @Get()
  @RequirePermissions(PermissionCode.PUBLIC_AREA_MANAGE)
  list(@Query('date') date?: string) {
    return this.publicAreas.list(date);
  }

  @Post()
  @RequirePermissions(PermissionCode.PUBLIC_AREA_MANAGE)
  create(@Body() dto: CreatePublicAreaDto) {
    return this.publicAreas.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.PUBLIC_AREA_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdatePublicAreaDto) {
    return this.publicAreas.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.PUBLIC_AREA_MANAGE)
  remove(@Param('id') id: string) {
    return this.publicAreas.remove(id);
  }

  @Post('sync-floor-plans')
  @RequirePermissions(PermissionCode.PUBLIC_AREA_MANAGE)
  syncFloorPlans() {
    return this.publicAreas.syncFromFloorPlans();
  }
}
