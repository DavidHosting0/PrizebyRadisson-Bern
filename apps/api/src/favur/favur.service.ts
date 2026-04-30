import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type FavurIntegration, type FavurUserMap } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { UpdateFavurConfigDto } from './dto/favur.dto';
import { FavurScraperService, type FavurShift } from './favur-scraper.service';

const SINGLETON_ID = 'default';

export type FavurConfigDto = {
  id: string;
  enabled: boolean;
  baseUrl: string;
  email: string | null;
  hasPassword: boolean;
  windowDays: number;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncCount: number;
  syncInProgress: boolean;
};

@Injectable()
export class FavurService {
  private readonly logger = new Logger(FavurService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly scraper: FavurScraperService,
    private readonly s3: S3Service,
  ) {}

  // ---------------- config ----------------

  async getConfig(): Promise<FavurConfigDto> {
    const row = await this.ensureRow();
    return this.toDto(row);
  }

  async updateConfig(dto: UpdateFavurConfigDto): Promise<FavurConfigDto> {
    await this.ensureRow();
    const data: Prisma.FavurIntegrationUpdateInput = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.baseUrl !== undefined) data.baseUrl = dto.baseUrl.replace(/\/+$/, '');
    if (dto.email !== undefined) data.email = dto.email.trim() || null;
    if (dto.windowDays !== undefined) data.windowDays = dto.windowDays;
    if (dto.password !== undefined) {
      const trimmed = dto.password.trim();
      data.encryptedPassword = trimmed
        ? this.cipher.encrypt(trimmed)
        : null;
      // New password invalidates any cached session token.
      data.encryptedSession = null;
      data.sessionExpiresAt = null;
    }
    const row = await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data,
    });
    return this.toDto(row);
  }

  // ---------------- user mapping ----------------

  async listFavurUsers() {
    const rows = await this.prisma.favurUserMap.findMany({
      orderBy: [{ favurDisplayName: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            titlePrefix: true,
            avatarS3Key: true,
            isActive: true,
          },
        },
      },
    });
    return Promise.all(rows.map((r) => this.serializeMap(r)));
  }

  async setFavurUserMapping(favurUserMapId: string, userId: string | null) {
    const row = await this.prisma.favurUserMap.findUnique({
      where: { id: favurUserMapId },
    });
    if (!row) throw new NotFoundException('Favur user not found');
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new BadRequestException('Local user not found');
    }
    const updated = await this.prisma.favurUserMap.update({
      where: { id: favurUserMapId },
      data: { userId: userId ?? null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            titlePrefix: true,
            avatarS3Key: true,
            isActive: true,
          },
        },
      },
    });
    return this.serializeMap(updated);
  }

  // ---------------- sync ----------------

  /**
   * Run one full sync. Safe to call concurrently — uses a DB advisory flag
   * so only one runs at a time (cron + manual button can't collide).
   */
  async syncNow(triggeredBy: 'manual' | 'cron'): Promise<FavurConfigDto> {
    const config = await this.ensureRow();
    if (!config.enabled) {
      throw new BadRequestException(
        'Favur sync is disabled. Enable it in admin → integrations.',
      );
    }
    if (!config.email || !config.encryptedPassword) {
      throw new BadRequestException(
        'Favur credentials are not configured.',
      );
    }
    if (config.syncInProgress) {
      this.logger.warn(`Favur sync already in progress, skipping ${triggeredBy} trigger`);
      return this.toDto(config);
    }

    // Try to claim the lock. Race-safe via updateMany + count check.
    const claimed = await this.prisma.favurIntegration.updateMany({
      where: { id: SINGLETON_ID, syncInProgress: false },
      data: { syncInProgress: true },
    });
    if (claimed.count === 0) {
      return this.toDto(await this.ensureRow());
    }

    try {
      const password = this.cipher.decryptSafe(config.encryptedPassword);
      if (!password) {
        await this.markFailed('Stored password could not be decrypted (key change?)');
        return this.toDto(await this.ensureRow());
      }

      const from = startOfDay(new Date());
      const to = addDays(from, config.windowDays);

      this.logger.log(
        `Favur sync starting (${triggeredBy}) for ${from.toISOString()} → ${to.toISOString()}`,
      );

      let shifts: FavurShift[];
      try {
        shifts = await this.scraper.fetchShifts(
          { email: config.email!, password, baseUrl: config.baseUrl },
          { from, to },
        );
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.warn(`Favur sync failed: ${msg}`);
        await this.markFailed(msg);
        return this.toDto(await this.ensureRow());
      }

      const persisted = await this.persistShifts(shifts, from, to);
      await this.prisma.favurIntegration.update({
        where: { id: SINGLETON_ID },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'ok',
          lastSyncError: null,
          lastSyncCount: persisted,
        },
      });
      this.logger.log(`Favur sync ok: ${persisted} shifts persisted`);
    } finally {
      // Release lock no matter what.
      await this.prisma.favurIntegration.update({
        where: { id: SINGLETON_ID },
        data: { syncInProgress: false },
      });
    }

    return this.toDto(await this.ensureRow());
  }

  // ---------------- helpers ----------------

  private async ensureRow(): Promise<FavurIntegration> {
    return this.prisma.favurIntegration.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
  }

  private async markFailed(message: string) {
    await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'error',
        lastSyncError: message.slice(0, 1000),
      },
    });
  }

  /**
   * Upsert FavurUserMap rows and rewrite the shifts inside `[from, to)` that
   * came from Favur. Shifts authored manually (source = 'manual') are left
   * alone. Returns the count of shift rows now in the window.
   */
  private async persistShifts(
    shifts: FavurShift[],
    from: Date,
    to: Date,
  ): Promise<number> {
    // 1) Make sure every Favur user we saw exists in FavurUserMap.
    const seen = new Map<string, string>();
    for (const s of shifts) {
      seen.set(s.favurUserId, s.favurDisplayName);
    }
    for (const [favurUserId, displayName] of seen.entries()) {
      await this.prisma.favurUserMap.upsert({
        where: { favurUserId },
        update: { favurDisplayName: displayName, lastSeenAt: new Date() },
        create: { favurUserId, favurDisplayName: displayName },
      });
    }

    // 2) Figure out which Favur users have a local mapping; only those become real shifts.
    const maps = await this.prisma.favurUserMap.findMany({
      where: { favurUserId: { in: [...seen.keys()] }, userId: { not: null } },
      select: { favurUserId: true, userId: true },
    });
    const favurToUser = new Map(maps.map((m) => [m.favurUserId, m.userId!]));

    // 3) Replace all favur-sourced shifts in window in a single transaction.
    await this.prisma.$transaction(async (tx) => {
      await tx.shift.deleteMany({
        where: {
          source: 'favur',
          startsAt: { gte: from, lt: to },
        },
      });
      const toCreate = shifts
        .filter((s) => favurToUser.has(s.favurUserId))
        .map((s) => ({
          userId: favurToUser.get(s.favurUserId)!,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          source: 'favur',
          sourceId: s.sourceId,
          label: s.label ?? null,
        }));
      if (toCreate.length) {
        await tx.shift.createMany({ data: toCreate, skipDuplicates: true });
      }
    });

    return this.prisma.shift.count({
      where: { source: 'favur', startsAt: { gte: from, lt: to } },
    });
  }

  private toDto(row: FavurIntegration): FavurConfigDto {
    return {
      id: row.id,
      enabled: row.enabled,
      baseUrl: row.baseUrl,
      email: row.email,
      hasPassword: !!row.encryptedPassword,
      windowDays: row.windowDays,
      lastSyncAt: row.lastSyncAt,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      lastSyncCount: row.lastSyncCount,
      syncInProgress: row.syncInProgress,
    };
  }

  private async serializeMap(
    row: FavurUserMap & {
      user: {
        id: string;
        name: string;
        email: string;
        role: string;
        titlePrefix: string;
        avatarS3Key: string | null;
        isActive: boolean;
      } | null;
    },
  ) {
    let avatarUrl: string | null = null;
    if (row.user?.avatarS3Key) {
      try {
        avatarUrl = (await this.s3.presignGet(row.user.avatarS3Key)).url;
      } catch {
        avatarUrl = null;
      }
    }
    return {
      id: row.id,
      favurUserId: row.favurUserId,
      favurDisplayName: row.favurDisplayName,
      lastSeenAt: row.lastSeenAt,
      user: row.user
        ? {
            id: row.user.id,
            name: row.user.name,
            email: row.user.email,
            role: row.user.role,
            titlePrefix: row.user.titlePrefix,
            isActive: row.user.isActive,
            avatarUrl,
          }
        : null,
    };
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
