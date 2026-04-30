import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateFavurConfigDto {
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
  shiftsJsonPath?: string;

  @IsOptional()
  @IsString()
  fieldShiftId?: string;

  @IsOptional()
  @IsString()
  fieldUserId?: string;

  @IsOptional()
  @IsString()
  fieldUserName?: string;

  @IsOptional()
  @IsString()
  fieldStartsAt?: string;

  @IsOptional()
  @IsString()
  fieldEndsAt?: string;

  @IsOptional()
  @IsString()
  fieldLabel?: string | null;
}

export class MapFavurUserDto {
  @IsOptional()
  @IsString()
  userId?: string | null;
}

class CookieDto {
  @IsString() name!: string;
  @IsString() value!: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() path?: string;
}

/**
 * What the browser extension POSTs to /favur/import for every captured
 * Favur API call.
 */
export class ImportCaptureDto {
  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsObject()
  headers!: Record<string, string>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CookieDto)
  cookies!: CookieDto[];

  @IsOptional()
  @IsString()
  body?: string;

  @IsInt()
  responseStatus!: number;

  /** Pre-truncated response body (max ~64 KB). */
  @IsString()
  responseSample!: string;

  @IsOptional()
  @IsString()
  capturedFrom?: string;
}
