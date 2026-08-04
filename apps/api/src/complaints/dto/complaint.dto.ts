import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { GuestComplaintCategory, GuestComplaintStatus } from '@prisma/client';

export class CreateComplaintDto {
  @IsEnum(GuestComplaintCategory)
  category!: GuestComplaintCategory;

  @IsOptional()
  @IsString()
  roomId?: string | null;

  @IsString()
  @MinLength(1)
  description!: string;
}

export class UpdateComplaintDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsEnum(GuestComplaintStatus)
  status?: GuestComplaintStatus;
}
