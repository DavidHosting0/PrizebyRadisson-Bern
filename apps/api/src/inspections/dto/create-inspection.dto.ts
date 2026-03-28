import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateInspectionDto {
  @IsUUID()
  roomId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  passed?: boolean;
}
