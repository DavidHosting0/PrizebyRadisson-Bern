import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
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
}
