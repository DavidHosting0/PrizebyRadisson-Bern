import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { UsersService } from './users.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('housekeepers')
  @RequirePermissions(PermissionCode.USERS_READ_HOUSEKEEPERS)
  listHousekeepers() {
    return this.users.listHousekeepers();
  }

  @Get()
  @RequirePermissions(PermissionCode.USERS_READ)
  list() {
    return this.users.list();
  }

  @Post()
  @RequirePermissions(PermissionCode.USERS_WRITE)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  /**
   * Self-service avatar endpoints — any authenticated user may update their own
   * profile picture, regardless of USERS_WRITE permissions.
   */
  @Post('me/avatar/presign')
  presignOwnAvatar(
    @CurrentUser('id') userId: string,
    @Body() body: { contentType?: string },
  ) {
    return this.users.presignOwnAvatar(userId, body?.contentType);
  }

  @Patch('me/avatar')
  setOwnAvatar(
    @CurrentUser('id') userId: string,
    @Body() body: { key?: string | null },
  ) {
    const key = body?.key;
    if (typeof key !== 'string' || !key.trim()) {
      throw new BadRequestException('key is required');
    }
    return this.users.setOwnAvatar(userId, key.trim());
  }

  @Delete('me/avatar')
  clearOwnAvatar(@CurrentUser('id') userId: string) {
    return this.users.setOwnAvatar(userId, null);
  }

  @Patch(':userId')
  @RequirePermissions(PermissionCode.USERS_WRITE)
  update(@Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    return this.users.update(userId, dto);
  }

  @Delete(':userId')
  @RequirePermissions(PermissionCode.USERS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('userId') userId: string, @CurrentUser('id') actorId: string) {
    return this.users.remove(userId, actorId);
  }
}
