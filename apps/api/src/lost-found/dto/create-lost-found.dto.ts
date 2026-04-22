import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LostFoundStatus } from '@prisma/client';

export class CreateLostFoundDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  roomId?: string | null;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  photoS3Key?: string | null;

  @IsOptional()
  @IsEnum(LostFoundStatus)
  status?: LostFoundStatus;

  /** Storage box code (e.g. A1..D4) when creating an item directly into storage. */
  @IsOptional()
  @IsString()
  storedLocation?: string | null;
}
