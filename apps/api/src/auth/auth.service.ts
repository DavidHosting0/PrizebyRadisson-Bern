import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
    private readonly users: UsersService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user?.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id);
  }

  async refresh(refreshTokenRaw: string) {
    const hash = this.hashToken(refreshTokenRaw);
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!row?.user?.isActive) throw new UnauthorizedException('Invalid refresh');

    // Atomic consume: deleteMany never throws P2025. If two clients race on the
    // same refresh token (common with multi-tab + Socket.IO reconnects),
    // exactly one wins; the loser sees a clean 401 instead of crashing the
    // request with a Prisma error.
    const consumed = await this.prisma.refreshToken.deleteMany({
      where: { id: row.id },
    });
    if (consumed.count === 0) {
      throw new UnauthorizedException('Refresh token already used');
    }
    return this.issueTokens(row.user.id);
  }

  async logout(refreshTokenRaw: string) {
    const hash = this.hashToken(refreshTokenRaw);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: hash } });
    return { ok: true };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        phone: true,
        titlePrefix: true,
        avatarS3Key: true,
        permissionGrants: { select: { permission: true } },
        roleAssignments: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                color: true,
                position: true,
                permissions: { select: { permission: true } },
              },
            },
          },
        },
      },
    });
    const grants = u.permissionGrants.map((g) => g.permission);
    const rolePerms = Array.from(
      new Set(u.roleAssignments.flatMap((a) => a.role.permissions.map((p) => p.permission))),
    );
    const effectivePermissions = this.permissions.effectiveFor(
      u.role,
      u.titlePrefix,
      grants,
      rolePerms,
    );
    const accessToken = await this.jwt.signAsync({
      sub: u.id,
      email: u.email,
      role: u.role,
    });
    const refreshRaw = randomBytes(48).toString('hex');
    const refreshHash = this.hashToken(refreshRaw);
    const refreshDays = parseInt(this.config.get<string>('JWT_REFRESH_DAYS') ?? '7', 10);
    const expiresAt = new Date(Date.now() + refreshDays * 86400_000);
    await this.prisma.refreshToken.create({
      data: { userId: u.id, tokenHash: refreshHash, expiresAt },
    });
    const avatarUrl = await this.users.resolveAvatarUrl(u.avatarS3Key);
    const roles = u.roleAssignments
      .map((a) => ({
        id: a.role.id,
        name: a.role.name,
        color: a.role.color,
        position: a.role.position,
      }))
      .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
    return {
      accessToken,
      refreshToken: refreshRaw,
      expiresIn: 900,
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        name: u.name,
        phone: u.phone,
        titlePrefix: u.titlePrefix,
        avatarUrl,
        permissions: effectivePermissions,
        roles,
      },
    };
  }
}
