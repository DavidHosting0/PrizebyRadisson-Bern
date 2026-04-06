import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PresignLostFoundDto {
  @IsString()
  contentType!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  roomId?: string;
}
