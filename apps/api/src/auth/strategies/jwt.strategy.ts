import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../../permissions/permissions.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

export type JwtPayload = { sub: string; email: string; role: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { permissionGrants: { select: { permission: true } } },
    });
    if (!user?.isActive) throw new UnauthorizedException();
    const grants = user.permissionGrants.map((g) => g.permission);
    const effectivePermissions = this.permissions.effectiveFor(user.role, user.titlePrefix, grants);
    return { ...user, effectivePermissions };
  }
}
