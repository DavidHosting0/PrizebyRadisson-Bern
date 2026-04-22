import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { LostFoundStatus } from '@prisma/client';
import { Transform } from 'class-transformer';

export class UpdateLostFoundDto {
  @IsOptional()
  @IsEnum(LostFoundStatus)
  status?: LostFoundStatus;

  @IsOptional()
  @IsString()
  storedLocation?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  guestContacted?: boolean;

  @IsOptional()
  @IsObject()
  claimedByGuestInfo?: Record<string, unknown>;
}
