import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class DirtyRoomTargetDto {
  @IsString()
  userId!: string;

  @IsInt()
  @Min(0)
  count!: number;
}

export class RunAutoAssignDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workingTodayUserIds?: string[];

  /** @deprecated Prefer restantAssigneeUserIds */
  @IsOptional()
  @IsString()
  restantAssigneeUserId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restantAssigneeUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lateShiftUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  publicAssigneeUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inspectorUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirtyRoomTargetDto)
  dirtyRoomTargets?: DirtyRoomTargetDto[];
}
