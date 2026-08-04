import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class LateShiftOverrideDto {
  @IsString()
  userId!: string;

  @IsBoolean()
  isLateShift!: boolean;

  @IsOptional()
  @IsString()
  date?: string;
}
