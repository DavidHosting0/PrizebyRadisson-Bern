import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class UpdateFavurConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  email?: string;

  /** Plaintext password; encrypted before storage and never returned. */
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  windowDays?: number;
}

export class MapFavurUserDto {
  @IsOptional()
  @IsString()
  userId?: string | null;
}
