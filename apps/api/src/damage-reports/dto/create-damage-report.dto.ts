import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { RoomDamageType } from '@prisma/client';

export class CreateDamageReportDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsEnum(RoomDamageType)
  damageType!: RoomDamageType;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  photoS3Key!: string;
}
