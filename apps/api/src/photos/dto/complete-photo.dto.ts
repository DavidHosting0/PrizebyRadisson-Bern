import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CompletePhotoDto {
  @IsUUID()
  photoId!: string;

  @IsString()
  mime!: string;

  @IsInt()
  @Min(0)
  bytes!: number;

  @IsOptional()
  @IsString()
  cleaningSessionId?: string;
}
