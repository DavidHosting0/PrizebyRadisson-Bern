import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ServiceRequestPriority } from '@prisma/client';

export class CreateServiceRequestDto {
  /** Prisma `cuid` — not a UUID */
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsString()
  @IsNotEmpty()
  typeId!: string;

  @IsEnum(ServiceRequestPriority)
  priority!: ServiceRequestPriority;

  @IsOptional()
  @IsString()
  description?: string;
}
