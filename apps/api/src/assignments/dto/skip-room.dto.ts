import { IsOptional, IsString } from 'class-validator';

export class SkipRoomDto {
  @IsString()
  roomId!: string;

  @IsOptional()
  @IsString()
  date?: string;
}
