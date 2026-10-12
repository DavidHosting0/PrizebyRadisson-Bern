import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
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

  /** Optional chat-only display override; omit/null → use titlePrefix. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsEnum(UserTitlePrefix)
  chatTitlePrefix?: UserTitlePrefix | null;

  /** Extra permissions beyond assigned roles (additive). */
  @IsOptional()
  @IsArray()
  @IsEnum(PermissionCode, { each: true })
  permissionGrants?: PermissionCode[];

  /** Custom role IDs to assign on creation. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}
