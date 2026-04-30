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
  Put,
} from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesService } from './roles.service';
import {
  CreateRoleDto,
  ReorderRolesDto,
  SetRoleMembersDto,
  UpdateRoleDto,
  UpdateRolePositionDto,
} from './dto/role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(PermissionCode.USERS_READ)
  list() {
    return this.roles.list();
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.USERS_READ)
  get(@Param('id') id: string) {
    return this.roles.get(id);
  }

  @Post()
  @RequirePermissions(PermissionCode.USERS_WRITE)
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.USERS_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.USERS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.roles.remove(id);
  }

  @Patch(':id/position')
  @RequirePermissions(PermissionCode.USERS_WRITE)
  setPosition(@Param('id') id: string, @Body() dto: UpdateRolePositionDto) {
    return this.roles.setPosition(id, dto);
  }

  @Post('reorder')
  @RequirePermissions(PermissionCode.USERS_WRITE)
  reorder(@Body() dto: ReorderRolesDto) {
    return this.roles.reorder(dto);
  }

  @Put(':id/members')
  @RequirePermissions(PermissionCode.USERS_WRITE)
  setMembers(@Param('id') id: string, @Body() dto: SetRoleMembersDto) {
    return this.roles.setMembers(id, dto);
  }

  @Post(':id/members/:userId')
  @RequirePermissions(PermissionCode.USERS_WRITE)
  addMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.roles.assignMember(id, userId);
  }

  @Delete(':id/members/:userId')
  @RequirePermissions(PermissionCode.USERS_WRITE)
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.roles.removeMember(id, userId);
  }
}
