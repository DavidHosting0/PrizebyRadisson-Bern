import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PatchDailyTaskDto {
  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
