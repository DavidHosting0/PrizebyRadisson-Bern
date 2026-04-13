import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ServiceRequestPriority,
  ServiceRequestStatus,
  User,
  PermissionCode,
} from '@prisma/client';
import { ServiceRequestsService } from './service-requests.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto';

@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly svc: ServiceRequestsService) {}

  @Get('types')
  @RequirePermissions(PermissionCode.SERVICE_REQUEST_READ)
  types() {
    return this.svc.types();
  }

  @Get()
  @RequirePermissions(PermissionCode.SERVICE_REQUEST_READ)
  list(
    @Query('status') status?: ServiceRequestStatus,
    @Query('roomId') roomId?: string,
    @Query('priority') priority?: ServiceRequestPriority,
  ) {
    return this.svc.list({ status, roomId, priority });
  }

  @Post()
  @RequirePermissions(PermissionCode.SERVICE_REQUEST_CREATE)
  create(@Body() dto: CreateServiceRequestDto, @CurrentUser() user: User) {
    return this.svc.create(dto, user);
  }

  @Post(':id/claim')
  @RequirePermissions(PermissionCode.SERVICE_REQUEST_CLAIM)
  claim(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.claim(id, user);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.SERVICE_REQUEST_PATCH)
  patch(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: UpdateServiceRequestDto) {
    if (dto.status == null && dto.priority == null) {
      throw new BadRequestException('status or priority is required');
    }
    return this.svc.patchRequest(id, user, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.SERVICE_REQUEST_CANCEL)
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.cancel(id, user);
  }
}
