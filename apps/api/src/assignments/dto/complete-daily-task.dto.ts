import { IsIn, IsOptional, IsString } from 'class-validator';

export class CompleteDailyTaskDto {
  /** Omit or CLEANED = normal finish. NO_CLEANING_REQUESTED requires photoS3Key (RESTANT only). */
  @IsOptional()
  @IsIn(['CLEANED', 'NO_CLEANING_REQUESTED'])
  reason?: 'CLEANED' | 'NO_CLEANING_REQUESTED';

  @IsOptional()
  @IsString()
  photoS3Key?: string;
}
