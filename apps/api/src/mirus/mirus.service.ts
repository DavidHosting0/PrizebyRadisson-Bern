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
import { MapMirusUserDto, UpdateMirusConfigDto } from './dto/mirus.dto';
import { syncMirusShifts } from './mirus-shift-sync';
import type { MirusSessionStored } from './mirus-http-auth';
import type { MirusShift } from './mirus-shift.types';

const SINGLETON_ID = 'default';
const SYNC_LOCK_STALE_MS = 2 * 60_000;
const SHIFT_SOURCE = 'mirus';

export type MirusConfigDto = {
  id: string;
  enabled: boolean;
  baseUrl: string;
  windowDays: number;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncCount: number;
  syncInProgress: boolean;
  mirusUsername: string | null;
  hasMirusPassword: boolean;
  mappedUserCount: number;
  unmappedUserCount: number;
};

@Injectable()
export class MirusService {
  private readonly logger = new Logger(MirusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly s3: S3Service,
  ) {}

  async getConfig(): Promise<MirusConfigDto> {
    await this.clearStaleSyncLock();
    const row = await this.ensureRow();
    return this.toDto(row);
  }

  async updateConfig(dto: UpdateMirusConfigDto): Promise<MirusConfigDto> {
    await this.ensureRow();
    const data: Prisma.FavurIntegrationUpdateInput = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.baseUrl !== undefined) {
      data.baseUrl = dto.baseUrl.replace(/\/+$/, '') || 'https://neo.mirus.ch';
    }
    if (dto.windowDays !== undefined) data.windowDays = dto.windowDays;
    if (dto.mirusUsername !== undefined) {
      data.mirusUsername = dto.mirusUsername.trim() || null;
    }
    if (dto.mirusPassword !== undefined && dto.mirusPassword.length > 0) {
      data.mirusPasswordEnc = this.cipher.encrypt(dto.mirusPassword);
      data.mirusSessionEnc = null;
      data.mirusSessionSavedAt = null;
    }
    const row = await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data,
    });
    return this.toDto(row);
  }

  async listUsers() {
    await this.purgeLegacyEmployees();
    const rows = await this.prisma.favurUserMap.findMany({
      orderBy: [{ favurDisplayName: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
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

  async setUserMapping(mapId: string, userId: string | null) {
    const row = await this.prisma.favurUserMap.findUnique({ where: { id: mapId } });
    if (!row) throw new NotFoundException('Mirus employee not found');
    if (userId) {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!u) throw new BadRequestException('Local user not found');
    }
    const updated = await this.prisma.favurUserMap.update({
      where: { id: mapId },
      data: { userId: userId ?? null },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
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

  async syncNow(triggeredBy: 'manual' | 'cron'): Promise<MirusConfigDto> {
    await this.clearStaleSyncLock();
    const config = await this.ensureRow();
    if (!config.enabled) {
      throw new BadRequestException(
        'Shift sync is disabled. Toggle it on in Admin → Integrationen.',
      );
    }

    const username = config.mirusUsername?.trim();
    const password = this.cipher.decryptSafe(config.mirusPasswordEnc);
    if (!username || !password) {
      const msg =
        'Mirus login not configured. Set username and password in Admin → Integrationen.';
      if (triggeredBy === 'manual') throw new BadRequestException(msg);
      await this.markFailed(msg);
      return this.toDto(await this.ensureRow());
    }

    if (config.syncInProgress) return this.toDto(config);

    const claim = await this.prisma.favurIntegration.updateMany({
      where: { id: SINGLETON_ID, syncInProgress: false },
      data: { syncInProgress: true, syncStartedAt: new Date() },
    });
    if (claim.count === 0) return this.toDto(await this.ensureRow());

    if (triggeredBy === 'manual') {
      void this.runSyncJob(config, username, password, triggeredBy).catch((err) => {
        this.logger.error(`Mirus background sync crashed: ${(err as Error).message}`);
      });
      return this.toDto(await this.ensureRow());
    }

    await this.runSyncJob(config, username, password, triggeredBy);
    return this.toDto(await this.ensureRow());
  }

  async unlockSync(): Promise<MirusConfigDto> {
    await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data: { syncInProgress: false, syncStartedAt: null },
    });
    this.logger.warn('Mirus sync lock force-unlocked by admin');
    return this.toDto(await this.ensureRow());
  }

  private async clearStaleSyncLock(): Promise<void> {
    const row = await this.ensureRow();
    if (!row.syncInProgress) return;

    const started = row.syncStartedAt;
    const age = started ? Date.now() - started.getTime() : Number.POSITIVE_INFINITY;
    const finishedAfterStart =
      !!row.lastSyncAt &&
      (!started || row.lastSyncAt.getTime() >= started.getTime() - 1000);
    const staleByAge = !started || age >= SYNC_LOCK_STALE_MS;
    const inconsistent = finishedAfterStart && age >= 30_000;

    if (!staleByAge && !inconsistent) return;

    this.logger.warn(
      `Clearing Mirus sync lock (age=${started ? Math.round(age / 1000) : 'unknown'}s, inconsistent=${inconsistent})`,
    );
    await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data: { syncInProgress: false, syncStartedAt: null },
    });
  }

  private async runSyncJob(
    config: FavurIntegration,
    username: string,
    password: string,
    triggeredBy: 'manual' | 'cron',
  ): Promise<void> {
    try {
      const from = startOfDay(new Date());
      const to = addDays(from, config.windowDays);
      let session: MirusSessionStored | null = null;
      if (config.mirusSessionEnc) {
        const plain = this.cipher.decryptSafe(config.mirusSessionEnc);
        if (plain) {
          try {
            session = JSON.parse(plain) as MirusSessionStored;
          } catch {
            session = null;
          }
        }
      }

      this.logger.log(`Mirus sync starting (${triggeredBy})`);
      const result = await syncMirusShifts({
        baseUrl: config.baseUrl,
        username,
        password,
        windowDays: config.windowDays,
        session,
      });

      const scraped = result.shifts.length;
      const { persisted, unmapped, written } = await this.persistShifts(
        result.shifts,
        from,
        to,
        result.selfPerson,
      );
      let status: string;
      let error: string | null;
      if (scraped === 0) {
        status = 'warn';
        error =
          '0 Schichten aus Mirus gelesen (Absenz-Tage oder Detail-Liste nicht geöffnet). Bestehende Schichten wurden behalten.';
      } else if (written === 0) {
        status = 'warn';
        error = `${scraped} Schichten gelesen, 0 gespeichert — ${unmapped} Mirus-Mitarbeiter noch nicht verknüpft. Unter «Mitarbeiter zuordnen» verknüpfen, dann erneut syncen.`;
      } else if (unmapped > 0) {
        status = 'ok';
        error = `${written} von ${scraped} Schichten gespeichert · ${unmapped} Mitarbeiter noch nicht verknüpft`;
      } else {
        status = 'ok';
        error = null;
      }

      await this.prisma.favurIntegration.update({
        where: { id: SINGLETON_ID },
        data: {
          mirusSessionEnc: this.cipher.encrypt(JSON.stringify(result.session)),
          mirusSessionSavedAt: new Date(),
          lastSyncAt: new Date(),
          lastSyncStatus: status,
          lastSyncError: error,
          lastSyncCount: persisted,
        },
      });
      this.logger.log(
        `Mirus sync done: scraped=${scraped} written=${written} unmappedPersons=${unmapped} persisted=${persisted} status=${status}`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Mirus sync failed: ${msg}`);
      await this.markFailed(msg);
    } finally {
      await this.prisma.favurIntegration.update({
        where: { id: SINGLETON_ID },
        data: { syncInProgress: false, syncStartedAt: null },
      });
    }
  }

  private async ensureRow(): Promise<FavurIntegration> {
    return this.prisma.favurIntegration.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID, baseUrl: 'https://neo.mirus.ch' },
    });
  }

  private async markFailed(message: string) {
    await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'error',
        lastSyncError: message.slice(0, 1000),
        syncInProgress: false,
        syncStartedAt: null,
      },
    });
  }

  /**
   * Remove legacy Favur employee rows (numeric portal IDs) and scrape garbage
   * (weekday/date strings). Keeps only Mirus-recognized persons.
   */
  async purgeLegacyEmployees(): Promise<{ deleted: number }> {
    const rows = await this.prisma.favurUserMap.findMany({
      select: { id: true, favurUserId: true, favurDisplayName: true },
    });
    const toDelete = rows.filter((r) => isLegacyOrGarbageEmployee(r.favurUserId, r.favurDisplayName));
    if (toDelete.length) {
      await this.prisma.favurUserMap.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });
      this.logger.log(`Purged ${toDelete.length} legacy Favur / garbage employee map rows`);
    }
    return { deleted: toDelete.length };
  }

  /**
   * Upserts employee map rows, then writes Shift rows only for manually mapped users.
   * Matches mappings by external id OR normalized display name (UUID vs name drift).
   * Empty scrapes do not wipe existing mirus/favur shifts in the window.
   */
  private async persistShifts(
    shifts: MirusShift[],
    from: Date,
    to: Date,
    selfPerson?: { externalUserId: string; displayName: string } | null,
  ): Promise<{ persisted: number; unmapped: number; written: number }> {
    await this.purgeLegacyEmployees();

    const seen = new Map<string, string>();
    if (selfPerson?.externalUserId) {
      seen.set(selfPerson.externalUserId, selfPerson.displayName);
    }
    for (const s of shifts) {
      if (isLegacyOrGarbageEmployee(s.externalUserId, s.displayName)) continue;
      seen.set(s.externalUserId, s.displayName);
    }
    for (const [externalUserId, displayName] of seen.entries()) {
      await this.prisma.favurUserMap.upsert({
        where: { favurUserId: externalUserId },
        update: { favurDisplayName: displayName, lastSeenAt: new Date() },
        create: { favurUserId: externalUserId, favurDisplayName: displayName },
      });
    }

    // Copy local userId onto new external ids when the display name already has a mapping
    // (e.g. mapped under lowercase name, later scraped with Person UUID).
    const mappedRows = await this.prisma.favurUserMap.findMany({
      where: { userId: { not: null } },
      select: { favurUserId: true, favurDisplayName: true, userId: true },
    });
    const userIdByNormName = new Map<string, string>();
    for (const m of mappedRows) {
      const key = normalizePersonName(m.favurDisplayName ?? '');
      if (key && m.userId) userIdByNormName.set(key, m.userId);
    }
    for (const [externalUserId, displayName] of seen.entries()) {
      const already = mappedRows.find((m) => m.favurUserId === externalUserId);
      if (already?.userId) continue;
      const uid = userIdByNormName.get(normalizePersonName(displayName));
      if (!uid) continue;
      await this.prisma.favurUserMap.update({
        where: { favurUserId: externalUserId },
        data: { userId: uid },
      });
      mappedRows.push({ favurUserId: externalUserId, favurDisplayName: displayName, userId: uid });
    }

    const byExternalId = new Map(
      mappedRows.filter((m) => m.userId).map((m) => [m.favurUserId, m.userId!]),
    );
    const resolveUserId = (externalUserId: string, displayName: string): string | undefined =>
      byExternalId.get(externalUserId) ??
      userIdByNormName.get(normalizePersonName(displayName));

    const unmapped = [...seen.entries()].filter(
      ([id, name]) => !resolveUserId(id, name),
    ).length;

    const cleanShifts = shifts.filter(
      (s) =>
        !isLegacyOrGarbageEmployee(s.externalUserId, s.displayName) &&
        seen.has(s.externalUserId),
    );

    const toCreate = cleanShifts
      .map((s) => {
        const userId = resolveUserId(s.externalUserId, s.displayName);
        if (!userId) return null;
        return {
          userId,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          source: SHIFT_SOURCE,
          sourceId: s.sourceId,
          label: s.label ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    if (toCreate.length === 0) {
      // Keep previous roster until at least one mapped shift can be written.
      const persisted = await this.prisma.shift.count({
        where: { source: SHIFT_SOURCE, startsAt: { gte: from, lt: to } },
      });
      return { persisted, unmapped, written: 0 };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shift.deleteMany({
        where: {
          source: { in: [SHIFT_SOURCE, 'favur'] },
          startsAt: { gte: from, lt: to },
        },
      });
      await tx.shift.createMany({ data: toCreate, skipDuplicates: true });
    });

    const persisted = await this.prisma.shift.count({
      where: { source: SHIFT_SOURCE, startsAt: { gte: from, lt: to } },
    });
    return { persisted, unmapped, written: toCreate.length };
  }

  private async toDto(row: FavurIntegration): Promise<MirusConfigDto> {
    const [mappedUserCount, unmappedUserCount] = await Promise.all([
      this.prisma.favurUserMap.count({ where: { userId: { not: null } } }),
      this.prisma.favurUserMap.count({ where: { userId: null } }),
    ]);
    return {
      id: row.id,
      enabled: row.enabled,
      baseUrl: row.baseUrl,
      windowDays: row.windowDays,
      lastSyncAt: row.lastSyncAt,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      lastSyncCount: row.lastSyncCount,
      syncInProgress: row.syncInProgress,
      mirusUsername: row.mirusUsername,
      hasMirusPassword: !!row.mirusPasswordEnc,
      mappedUserCount,
      unmappedUserCount,
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
      externalUserId: row.favurUserId,
      displayName: row.favurDisplayName,
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

/** Old Favur portal used numeric employee ids; Mirus uses names or Person UUIDs. */
function isLegacyOrGarbageEmployee(
  externalId: string,
  displayName: string | null | undefined,
): boolean {
  const id = (externalId ?? '').trim();
  const name = (displayName ?? '').trim();
  if (/^\d+$/.test(id)) return true;
  const label = name || id;
  if (
    /^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i.test(label)
  ) {
    return true;
  }
  if (
    /\b\d{1,2}\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i.test(
      label,
    )
  ) {
    return true;
  }
  return false;
}

function normalizePersonName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
