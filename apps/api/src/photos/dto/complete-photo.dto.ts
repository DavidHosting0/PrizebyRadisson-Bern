import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CompletePhotoDto {
  @IsString()
  @IsNotEmpty()
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
