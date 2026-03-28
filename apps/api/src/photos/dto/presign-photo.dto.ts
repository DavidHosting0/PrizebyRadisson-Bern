import { IsOptional, IsString } from 'class-validator';

export class PresignPhotoDto {
  @IsOptional()
  @IsString()
  contentType?: string;
}
