import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PermissionCode, UserRole, UserTitlePrefix } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsEnum(UserTitlePrefix)
  titlePrefix!: UserTitlePrefix;

  /** Extra permissions beyond role + title-prefix defaults (additive). */
  @IsOptional()
  @IsArray()
  @IsEnum(PermissionCode, { each: true })
  permissionGrants?: PermissionCode[];
}
