import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const avatarUrl = await this.users.resolveAvatarUrl(user.avatarS3Key);
    const roles = user.roleAssignments
      .map((a) => ({
        id: a.role.id,
        name: a.role.name,
        color: a.role.color,
        position: a.role.position,
      }))
      .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      phone: user.phone,
      titlePrefix: user.titlePrefix,
      avatarUrl,
      permissions: user.effectivePermissions,
      roles,
    };
  }
}
