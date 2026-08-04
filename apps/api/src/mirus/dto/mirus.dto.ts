import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class UpdateMirusConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  baseUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  windowDays?: number;

  @IsOptional()
  @IsString()
  mirusUsername?: string;

  /** Leave empty to keep existing password. */
  @IsOptional()
  @IsString()
  mirusPassword?: string;
}

export class MapMirusUserDto {
  @IsOptional()
  @IsString()
  userId?: string | null;
}
