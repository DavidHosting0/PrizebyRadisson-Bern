import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { PermissionCode, UserRole, UserTitlePrefix } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserTitlePrefix)
  titlePrefix?: UserTitlePrefix;

  /** Null clears override so chat falls back to titlePrefix (app area). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(UserTitlePrefix)
  chatTitlePrefix?: UserTitlePrefix | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  /** Replace extra grants entirely when provided (empty array clears grants). */
  @IsOptional()
  @IsArray()
  @IsEnum(PermissionCode, { each: true })
  permissionGrants?: PermissionCode[];

  /** Replace the user's custom-role memberships entirely (empty array clears). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}
