import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma, type FavurIntegration, type FavurUserMap } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { ImportCaptureDto, ImportDomShiftsDto, UpdateFavurConfigDto } from './dto/favur.dto';
import {
  FavurScraperService,
  type ActiveTemplate,
  type FavurShift,
  type ParseConfig,
} from './favur-scraper.service';
import { syncMirusShifts } from './mirus-shift-sync';
import type { MirusSessionStored } from './mirus-http-auth';

const SINGLETON_ID = 'default';
/** Abandoned sync locks older than this are cleared automatically. */
const SYNC_LOCK_STALE_MS = 2 * 60_000;

export type FavurConfigDto = {
  id: string;
  enabled: boolean;
  baseUrl: string;
  windowDays: number;
  hasApiKey: boolean;
  apiKey: string | null; // only included when admin specifically requests it
  hasActiveCapture: boolean;
  activeCaptureId: string | null;
  activeUrl: string | null;
  activeMethod: string | null;
  activeCapturedAt: Date | null;
  shiftsJsonPath: string;
  fieldShiftId: string;
  fieldUserId: string;
  fieldUserName: string;
  fieldStartsAt: string;
  fieldEndsAt: string;
  fieldLabel: string | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncCount: number;
  syncInProgress: boolean;
  /** True when baseUrl points at Mirus NEO (server login sync). */
  domMode: boolean;
  mirusUsername: string | null;
  hasMirusPassword: boolean;
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

  async getConfig(includeApiKey = false): Promise<FavurConfigDto> {
    await this.clearStaleSyncLock();
    const row = await this.ensureRow();
    return this.toDto(row, includeApiKey);
  }

  async updateConfig(dto: UpdateFavurConfigDto): Promise<FavurConfigDto> {
    await this.ensureRow();
    const data: Prisma.FavurIntegrationUpdateInput = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.baseUrl !== undefined) data.baseUrl = dto.baseUrl.replace(/\/+$/, '');
    if (dto.windowDays !== undefined) data.windowDays = dto.windowDays;
    if (dto.shiftsJsonPath !== undefined) data.shiftsJsonPath = dto.shiftsJsonPath;
    if (dto.fieldShiftId !== undefined) data.fieldShiftId = dto.fieldShiftId;
    if (dto.fieldUserId !== undefined) data.fieldUserId = dto.fieldUserId;
    if (dto.fieldUserName !== undefined) data.fieldUserName = dto.fieldUserName;
    if (dto.fieldStartsAt !== undefined) data.fieldStartsAt = dto.fieldStartsAt;
    if (dto.fieldEndsAt !== undefined) data.fieldEndsAt = dto.fieldEndsAt;
    if (dto.fieldLabel !== undefined) data.fieldLabel = dto.fieldLabel ?? null;
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

  /** Create a new API key for the browser extension; returns the plaintext once. */
  async regenerateApiKey(): Promise<{ apiKey: string }> {
    await this.ensureRow();
    const apiKey = randomBytes(24).toString('base64url');
    await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data: { apiKey },
    });
    return { apiKey };
  }

  // ---------------- extension capture flow ----------------

  /**
   * Called by the browser extension on every captured Favur API request.
   * We:
   *   1. encrypt + persist the capture as history
   *   2. score it (does it look like a shifts list?) and auto-promote the best
   *      one to the active template (unless an admin manually pinned one)
   *   3. cap history at the most recent 50 entries
   */
  async importCapture(dto: ImportCaptureDto): Promise<{
    captureId: string;
    activated: boolean;
  }> {
    const cookieString = (dto.cookies ?? [])
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const headersJson = JSON.stringify(dto.headers ?? {});
    const sample = (dto.responseSample ?? '').slice(0, 64 * 1024);

    const isFavurTeamplan = looksLikeFavurTeamplanCapture(dto);
    const shape = isFavurTeamplan ? 'favur:teamplanWithTeams' : describeShape(sample);

    const capture = await this.prisma.favurCapture.create({
      data: {
        url: dto.url,
        method: (dto.method ?? 'GET').toUpperCase(),
        headers: this.cipher.encrypt(headersJson),
        cookies: this.cipher.encrypt(cookieString),
        body: dto.body ? this.cipher.encrypt(dto.body) : null,
        responseStatus: dto.responseStatus,
        responseSample: this.cipher.encrypt(sample),
        responseShape: shape,
        capturedFrom: dto.capturedFrom?.slice(0, 200) ?? null,
      },
      select: { id: true, url: true, method: true, capturedAt: true },
    });

    // Trim history to last 50.
    const stale = await this.prisma.favurCapture.findMany({
      orderBy: { capturedAt: 'desc' },
      skip: 50,
      select: { id: true },
    });
    if (stale.length) {
      await this.prisma.favurCapture.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }

    // Auto-promote: Favur teamplan captures are unambiguous, always promote
    // (a fresher one replaces an older one within ≤6h; otherwise leave alone
    // so an admin's manual pin sticks). For unknown shapes, only promote if
    // the response is an array and we have no active capture yet.
    const config = await this.ensureRow();
    const shouldActivate = isFavurTeamplan
      ? !config.activeCaptureId || isOlderThan(config.activeCapturedAt, 6)
      : shape.startsWith('array<') &&
        (!config.activeCaptureId || isOlderThan(config.activeCapturedAt, 6));

    if (shouldActivate) {
      await this.activateCaptureInternal(capture.id);
    }

    return { captureId: capture.id, activated: shouldActivate };
  }

  /**
   * Mirus NEO: extension posts pre-parsed shift rows scraped from the DOM.
   * No HTTP replay — data is persisted directly.
   */
  async importDomShifts(dto: ImportDomShiftsDto): Promise<{
    persisted: number;
    received: number;
  }> {
    const config = await this.ensureRow();
    const from = dto.fromDate
      ? startOfDay(parseIsoDate(dto.fromDate))
      : dto.date
        ? startOfDay(parseIsoDate(dto.date))
        : startOfDay(new Date());
    const to = dto.toDate
      ? addDays(startOfDay(parseIsoDate(dto.toDate)), 1)
      : addDays(from, config.windowDays);

    const shifts: FavurShift[] = [];
    for (const row of dto.shifts ?? []) {
      const startsAt = new Date(row.startsAt);
      const endsAt = new Date(row.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;
      const userId = row.favurUserId?.trim() || row.displayName?.trim();
      const displayName = row.displayName?.trim() || userId;
      if (!userId) continue;
      shifts.push({
        favurUserId: userId,
        favurDisplayName: displayName,
        startsAt,
        endsAt,
        sourceId: row.sourceId?.trim() || `${userId}-${startsAt.toISOString()}`,
        label: row.label ?? null,
      });
    }

    this.logger.log(
      `Mirus DOM import (${dto.trigger ?? 'unknown'}): ${shifts.length} shifts received`,
    );

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

    return { persisted, received: dto.shifts?.length ?? 0 };
  }

  async listCaptures() {
    const rows = await this.prisma.favurCapture.findMany({
      orderBy: { capturedAt: 'desc' },
      select: {
        id: true,
        url: true,
        method: true,
        responseStatus: true,
        responseShape: true,
        capturedAt: true,
        capturedFrom: true,
      },
    });
    const config = await this.ensureRow();
    return rows.map((r) => ({
      ...r,
      isActive: r.id === config.activeCaptureId,
    }));
  }

  async getCaptureSample(id: string) {
    const row = await this.prisma.favurCapture.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        method: true,
        responseStatus: true,
        responseShape: true,
        responseSample: true,
        capturedAt: true,
        capturedFrom: true,
      },
    });
    if (!row) throw new NotFoundException('Capture not found');
    return {
      ...row,
      responseSample: this.cipher.decryptSafe(row.responseSample) ?? '',
    };
  }

  async activateCapture(id: string): Promise<FavurConfigDto> {
    await this.activateCaptureInternal(id);
    return this.toDto(await this.ensureRow());
  }

  async deleteCapture(id: string): Promise<void> {
    const config = await this.ensureRow();
    if (config.activeCaptureId === id) {
      throw new BadRequestException(
        'Cannot delete the active capture. Activate another one first.',
      );
    }
    await this.prisma.favurCapture.delete({ where: { id } });
  }

  private async activateCaptureInternal(id: string) {
    const cap = await this.prisma.favurCapture.findUnique({ where: { id } });
    if (!cap) throw new NotFoundException('Capture not found');
    await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data: {
        activeCaptureId: cap.id,
        activeUrl: cap.url,
        activeMethod: cap.method,
        activeHeaders: cap.headers,
        activeCookies: cap.cookies,
        activeBody: cap.body,
        activeCapturedAt: cap.capturedAt,
      },
    });
  }

  // ---------------- user mapping ----------------

  async listFavurUsers() {
    const rows = await this.prisma.favurUserMap.findMany({
      orderBy: [{ favurDisplayName: 'asc' }],
      include: {
        user: {
          select: {
            id: true, email: true, name: true, role: true,
            titlePrefix: true, avatarS3Key: true, isActive: true,
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
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!u) throw new BadRequestException('Local user not found');
    }
    const updated = await this.prisma.favurUserMap.update({
      where: { id: favurUserMapId },
      data: { userId: userId ?? null },
      include: {
        user: {
          select: {
            id: true, email: true, name: true, role: true,
            titlePrefix: true, avatarS3Key: true, isActive: true,
          },
        },
      },
    });
    return this.serializeMap(updated);
  }

  // ---------------- sync ----------------

  async syncNow(triggeredBy: 'manual' | 'cron'): Promise<FavurConfigDto> {
    await this.clearStaleSyncLock();
    const config = await this.ensureRow();
    if (!config.enabled) {
      throw new BadRequestException(
        'Shift sync is disabled. Toggle it on in admin → integrations.',
      );
    }

    return this.syncMirusMode(config, triggeredBy);
  }

  /**
   * Clear abandoned sync locks so the admin UI does not stay on "Synchronisiert…".
   * Also clears inconsistent state (error already written but lock still held).
   */
  private async clearStaleSyncLock(): Promise<void> {
    const row = await this.ensureRow();
    if (!row.syncInProgress) return;

    const started = row.syncStartedAt;
    const age = started ? Date.now() - started.getTime() : Number.POSITIVE_INFINITY;
    const finishedAfterStart =
      !!row.lastSyncAt &&
      (!started || row.lastSyncAt.getTime() >= started.getTime() - 1000);
    const staleByAge = !started || age >= SYNC_LOCK_STALE_MS;
    // lastSync* was updated while lock still held → previous job died after markFailed / mid-write
    const inconsistent = finishedAfterStart && age >= 30_000;

    if (!staleByAge && !inconsistent) return;

    this.logger.warn(
      `Clearing Mirus sync lock (age=${started ? Math.round(age / 1000) : 'unknown'}s, inconsistent=${inconsistent})`,
    );
    await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data: {
        syncInProgress: false,
        syncStartedAt: null,
      },
    });
  }

  /** Admin: force-clear the sync lock so the button is usable again. */
  async unlockSync(): Promise<FavurConfigDto> {
    await this.prisma.favurIntegration.update({
      where: { id: SINGLETON_ID },
      data: {
        syncInProgress: false,
        syncStartedAt: null,
      },
    });
    this.logger.warn('Mirus sync lock force-unlocked by admin');
    return this.toDto(await this.ensureRow());
  }

  /** @deprecated Legacy Favur extension capture replay — kept for reference only. */
  private async syncLegacyCaptureMode(
    config: FavurIntegration,
    triggeredBy: 'manual' | 'cron',
  ): Promise<FavurConfigDto> {
    if (!config.activeCaptureId || !config.activeUrl || !config.activeHeaders || !config.activeCookies) {
      throw new BadRequestException(
        'No active capture from the extension yet.',
      );
    }
    if (config.syncInProgress) return this.toDto(config);

    const claim = await this.prisma.favurIntegration.updateMany({
      where: { id: SINGLETON_ID, syncInProgress: false },
      data: { syncInProgress: true, syncStartedAt: new Date() },
    });
    if (claim.count === 0) return this.toDto(await this.ensureRow());

    try {
      const headersJson = this.cipher.decryptSafe(config.activeHeaders);
      const cookieString = this.cipher.decryptSafe(config.activeCookies);
      const body = config.activeBody ? this.cipher.decryptSafe(config.activeBody) : null;
      if (!headersJson || cookieString == null) {
        await this.markFailed('Stored capture could not be decrypted (encryption key changed?)');
        return this.toDto(await this.ensureRow());
      }
      const template: ActiveTemplate = {
        url: config.activeUrl,
        method: config.activeMethod ?? 'GET',
        headers: JSON.parse(headersJson) as Record<string, string>,
        cookies: cookieString,
        body,
      };
      const parse: ParseConfig = {
        shiftsJsonPath: config.shiftsJsonPath,
        fieldShiftId: config.fieldShiftId,
        fieldUserId: config.fieldUserId,
        fieldUserName: config.fieldUserName,
        fieldStartsAt: config.fieldStartsAt,
        fieldEndsAt: config.fieldEndsAt,
        fieldLabel: config.fieldLabel,
      };

      const from = startOfDay(new Date());
      const to = addDays(from, config.windowDays);

      this.logger.log(
        `Favur sync starting (${triggeredBy}) for ${from.toISOString()} → ${to.toISOString()}`,
      );

      let shifts: FavurShift[];
      try {
        shifts = await this.scraper.fetchShifts(template, parse, { from, to });
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
      await this.prisma.favurIntegration.update({
        where: { id: SINGLETON_ID },
        data: { syncInProgress: false, syncStartedAt: null },
      });
    }

    return this.toDto(await this.ensureRow());
  }

  /** Mirus NEO: HTTP login + Dienstplan scrape (Playwright with session cookies). */
  private async syncMirusMode(
    config: FavurIntegration,
    triggeredBy: 'manual' | 'cron',
  ): Promise<FavurConfigDto> {
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

    // Manual sync returns immediately so the HTTP request / proxy cannot hang
    // and leave syncInProgress stuck. Cron waits for completion.
    if (triggeredBy === 'manual') {
      void this.runMirusSyncJob(config, username, password, triggeredBy).catch((err) => {
        this.logger.error(`Mirus background sync crashed: ${(err as Error).message}`);
      });
      return this.toDto(await this.ensureRow());
    }

    await this.runMirusSyncJob(config, username, password, triggeredBy);
    return this.toDto(await this.ensureRow());
  }

  private async runMirusSyncJob(
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

      const persisted = await this.persistShifts(result.shifts, from, to);
      await this.prisma.favurIntegration.update({
        where: { id: SINGLETON_ID },
        data: {
          mirusSessionEnc: this.cipher.encrypt(JSON.stringify(result.session)),
          mirusSessionSavedAt: new Date(),
          lastSyncAt: new Date(),
          lastSyncStatus: 'ok',
          lastSyncError: null,
          lastSyncCount: persisted,
        },
      });
      this.logger.log(`Mirus sync ok: ${persisted} shifts persisted`);
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

  // ---------------- internals ----------------

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
        syncInProgress: false,
        syncStartedAt: null,
      },
    });
  }

  private async persistShifts(
    shifts: FavurShift[],
    from: Date,
    to: Date,
  ): Promise<number> {
    const seen = new Map<string, string>();
    for (const s of shifts) seen.set(s.favurUserId, s.favurDisplayName);
    for (const [favurUserId, displayName] of seen.entries()) {
      await this.prisma.favurUserMap.upsert({
        where: { favurUserId },
        update: { favurDisplayName: displayName, lastSeenAt: new Date() },
        create: { favurUserId, favurDisplayName: displayName },
      });
    }

    const maps = await this.prisma.favurUserMap.findMany({
      where: { favurUserId: { in: [...seen.keys()] }, userId: { not: null } },
      select: { favurUserId: true, userId: true },
    });
    const favurToUser = new Map(maps.map((m) => [m.favurUserId, m.userId!]));

    await this.prisma.$transaction(async (tx) => {
      await tx.shift.deleteMany({
        where: { source: 'favur', startsAt: { gte: from, lt: to } },
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

  private toDto(row: FavurIntegration, includeApiKey = false): FavurConfigDto {
    return {
      id: row.id,
      enabled: row.enabled,
      baseUrl: row.baseUrl,
      windowDays: row.windowDays,
      hasApiKey: !!row.apiKey,
      apiKey: includeApiKey ? row.apiKey : null,
      hasActiveCapture: !!row.activeCaptureId,
      activeCaptureId: row.activeCaptureId,
      activeUrl: row.activeUrl,
      activeMethod: row.activeMethod,
      activeCapturedAt: row.activeCapturedAt,
      shiftsJsonPath: row.shiftsJsonPath,
      fieldShiftId: row.fieldShiftId,
      fieldUserId: row.fieldUserId,
      fieldUserName: row.fieldUserName,
      fieldStartsAt: row.fieldStartsAt,
      fieldEndsAt: row.fieldEndsAt,
      fieldLabel: row.fieldLabel,
      lastSyncAt: row.lastSyncAt,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      lastSyncCount: row.lastSyncCount,
      syncInProgress: row.syncInProgress,
      domMode: isDomMode(row.baseUrl),
      mirusUsername: row.mirusUsername,
      hasMirusPassword: !!row.mirusPasswordEnc,
    };
  }

  private async serializeMap(
    row: FavurUserMap & {
      user: {
        id: string; name: string; email: string; role: string;
        titlePrefix: string; avatarS3Key: string | null; isActive: boolean;
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

// ---------------- helpers ----------------

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
function parseIsoDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function isDomMode(baseUrl: string): boolean {
  return /mirus\.ch/i.test(baseUrl);
}
function isOlderThan(d: Date | null, hours: number): boolean {
  if (!d) return true;
  return Date.now() - d.getTime() > hours * 3_600_000;
}

function looksLikeFavurTeamplanCapture(dto: ImportCaptureDto): boolean {
  if (!/\/graphql(?:$|[/?#])/i.test(dto.url)) return false;
  const body = dto.body ?? '';
  if (!body.includes('teamplanWithTeams')) return false;
  // Ignore probe / non-200 captures.
  if (dto.responseStatus < 200 || dto.responseStatus >= 300) return false;
  return true;
}

/**
 * Heuristic shape descriptor for a JSON sample. Used to auto-promote captures
 * that look like shift arrays (e.g. "array<10>{ id, startsAt, endsAt, ... }").
 */
function describeShape(sample: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sample);
  } catch {
    return 'non-json';
  }
  return shapeOf(parsed, 0);
}
function shapeOf(v: unknown, depth: number): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'array<0>';
    const first = v[0];
    if (depth > 2) return `array<${v.length}>`;
    return `array<${v.length}>${shapeOf(first, depth + 1)}`;
  }
  if (typeof v === 'object') {
    if (depth > 2) return 'object';
    const keys = Object.keys(v as Record<string, unknown>).slice(0, 12);
    return `{${keys.join(',')}}`;
  }
  return typeof v;
}
