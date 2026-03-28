import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ChecklistTaskStatus } from '@prisma/client';

export class UpdateChecklistTaskDto {
  @IsEnum(ChecklistTaskStatus)
  status!: ChecklistTaskStatus;

  @IsOptional()
  @IsBoolean()
  supervisorOverride?: boolean;
}
