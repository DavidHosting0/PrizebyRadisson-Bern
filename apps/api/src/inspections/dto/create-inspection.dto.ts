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

  /** READY room photo uploaded before create (required). */
  @IsString()
  @IsNotEmpty()
  photoId!: string;
}
