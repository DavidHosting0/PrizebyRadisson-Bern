import { IsOptional, IsString, IsUUID } from 'class-validator';

export class PresignLostFoundDto {
  @IsString()
  contentType!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;
}
