import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('housekeepers')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  listHousekeepers() {
    return this.users.listHousekeepers();
  }

  @Get()
  @Roles(UserRole.ADMIN)
  list() {
    return this.users.list();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':userId')
  @Roles(UserRole.ADMIN)
  update(@Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    return this.users.update(userId, dto);
  }

  @Delete(':userId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('userId') userId: string, @CurrentUser('id') actorId: string) {
    return this.users.remove(userId, actorId);
  }
}
