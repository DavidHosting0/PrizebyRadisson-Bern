import { IsArray, IsOptional, IsString } from 'class-validator';

export class RunAutoAssignDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  restantAssigneeUserId?: string | null;

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
