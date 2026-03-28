import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ServiceRequestPriority,
  ServiceRequestStatus,
  User,
  UserRole,
} from '@prisma/client';
import { ServiceRequestsService } from './service-requests.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto';

@Controller('service-requests')
@UseGuards(RolesGuard)
export class ServiceRequestsController {
  constructor(private readonly svc: ServiceRequestsService) {}

  @Get('types')
  @Roles(UserRole.RECEPTION, UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.ADMIN)
  types() {
    return this.svc.types();
  }

  @Get()
  @Roles(UserRole.RECEPTION, UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.ADMIN)
  list(
    @Query('status') status?: ServiceRequestStatus,
    @Query('roomId') roomId?: string,
    @Query('priority') priority?: ServiceRequestPriority,
  ) {
    return this.svc.list({ status, roomId, priority });
  }

  @Post()
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  create(@Body() dto: CreateServiceRequestDto, @CurrentUser() user: User) {
    return this.svc.create(dto, user);
  }

  @Post(':id/claim')
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR)
  claim(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.claim(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.HOUSEKEEPER, UserRole.RECEPTION, UserRole.SUPERVISOR, UserRole.ADMIN)
  patch(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: UpdateServiceRequestDto) {
    if (dto.status == null && dto.priority == null) {
      throw new BadRequestException('status or priority is required');
    }
    return this.svc.patchRequest(id, user, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.RECEPTION, UserRole.SUPERVISOR, UserRole.ADMIN)
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.cancel(id, user);
  }
}
