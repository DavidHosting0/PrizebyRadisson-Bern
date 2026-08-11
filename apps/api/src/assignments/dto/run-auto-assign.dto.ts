import { IsArray, IsOptional, IsString } from 'class-validator';

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
}
