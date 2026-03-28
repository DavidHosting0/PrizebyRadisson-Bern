import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { LostFoundStatus } from '@prisma/client';

export class CreateLostFoundDto {
  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  photoS3Key?: string | null;

  @IsOptional()
  @IsEnum(LostFoundStatus)
  status?: LostFoundStatus;
}
