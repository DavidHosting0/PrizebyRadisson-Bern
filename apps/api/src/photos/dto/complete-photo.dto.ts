import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CompletePhotoDto {
  @IsString()
  @IsNotEmpty()
  photoId!: string;

  @IsString()
  mime!: string;

  /** Blob.size can be a float in some browsers; round for Prisma Int. */
  @Transform(({ value }) =>
    value == null || value === '' ? value : Math.round(Number(value)),
  )
  @IsInt()
  @Min(0)
  bytes!: number;

  @IsOptional()
  @IsString()
  cleaningSessionId?: string;
}
