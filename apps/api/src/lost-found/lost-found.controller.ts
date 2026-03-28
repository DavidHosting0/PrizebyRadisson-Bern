import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LostFoundStatus, User, UserRole } from '@prisma/client';
import { LostFoundService } from './lost-found.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateLostFoundDto } from './dto/create-lost-found.dto';
import { UpdateLostFoundDto } from './dto/update-lost-found.dto';

@Controller('lost-found')
@UseGuards(RolesGuard)
export class LostFoundController {
  constructor(private readonly lostFound: LostFoundService) {}

  @Get()
  @Roles(UserRole.RECEPTION, UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.ADMIN)
  list(@Query('status') status?: LostFoundStatus, @Query('q') q?: string) {
    return this.lostFound.list({ status, q });
  }

  @Post()
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.ADMIN)
  create(@Body() dto: CreateLostFoundDto, @CurrentUser() user: User) {
    return this.lostFound.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.RECEPTION, UserRole.SUPERVISOR, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateLostFoundDto, @CurrentUser() user: User) {
    return this.lostFound.update(id, dto, user);
  }
}
