import { IsNotEmpty, IsString } from 'class-validator';

export class PresignDamageReportDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsString()
  contentType!: string;
}
