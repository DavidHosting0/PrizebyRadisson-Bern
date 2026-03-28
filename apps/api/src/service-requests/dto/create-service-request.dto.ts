import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ServiceRequestPriority } from '@prisma/client';

export class CreateServiceRequestDto {
  @IsUUID()
  roomId!: string;

  @IsUUID()
  typeId!: string;

  @IsEnum(ServiceRequestPriority)
  priority!: ServiceRequestPriority;

  @IsOptional()
  @IsString()
  description?: string;
}
