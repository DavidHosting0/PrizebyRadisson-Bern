import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { LostFoundStatus } from '@prisma/client';

export class UpdateLostFoundDto {
  @IsOptional()
  @IsEnum(LostFoundStatus)
  status?: LostFoundStatus;

  @IsOptional()
  @IsString()
  storedLocation?: string | null;

  @IsOptional()
  @IsObject()
  claimedByGuestInfo?: Record<string, unknown>;
}
