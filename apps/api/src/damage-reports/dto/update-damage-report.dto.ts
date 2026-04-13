import { IsEnum, IsOptional } from 'class-validator';
import { RoomDamageReportStatus } from '@prisma/client';

export class UpdateDamageReportDto {
  @IsOptional()
  @IsEnum(RoomDamageReportStatus)
  status?: RoomDamageReportStatus;
}
