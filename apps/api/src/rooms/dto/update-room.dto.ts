import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateRoomDto {
  @IsOptional()
  @IsBoolean()
  outOfOrder?: boolean;

  @IsOptional()
  @IsString()
  oooReason?: string | null;

  @IsOptional()
  @IsDateString()
  oooUntil?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
