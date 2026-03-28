import { IsEnum, IsOptional } from 'class-validator';
import { ServiceRequestPriority, ServiceRequestStatus } from '@prisma/client';

export class UpdateServiceRequestDto {
  @IsOptional()
  @IsEnum(ServiceRequestStatus)
  status?: ServiceRequestStatus;

  @IsOptional()
  @IsEnum(ServiceRequestPriority)
  priority?: ServiceRequestPriority;
}
