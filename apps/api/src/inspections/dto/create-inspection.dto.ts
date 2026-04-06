import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInspectionDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  passed?: boolean;
}
