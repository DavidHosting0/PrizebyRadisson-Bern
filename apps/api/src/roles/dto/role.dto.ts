import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PermissionCode } from '@prisma/client';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: 'color must be a 6-digit hex like #5865F2' })
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsEnum(PermissionCode, { each: true })
  permissions?: PermissionCode[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: 'color must be a 6-digit hex like #5865F2' })
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsEnum(PermissionCode, { each: true })
  permissions?: PermissionCode[];
}

/** Body for the bulk reorder endpoint. The order in the array determines position. */
export class ReorderRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}

/** Body for assigning/removing a single role on a single user. */
export class AssignRoleMemberDto {
  @IsString()
  userId!: string;
}

/** Body for replacing a user's full set of role memberships. */
export class SetUserRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleIds!: string[];
}

/** Body for replacing all members of a role at once. */
export class SetRoleMembersDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  userIds!: string[];
}

export class UpdateRolePositionDto {
  @IsInt()
  @Min(0)
  position!: number;
}
