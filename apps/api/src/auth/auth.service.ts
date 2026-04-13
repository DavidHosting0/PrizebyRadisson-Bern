import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
    await this.prisma.refreshToken.delete({ where: { id: row.id } });
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
      },
    });
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
      },
    };
  }
}
