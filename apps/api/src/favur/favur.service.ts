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
import { ImportCaptureDto, UpdateFavurConfigDto } from './dto/favur.dto';
import {
  FavurScraperService,
  type ActiveTemplate,
  type FavurShift,
  type ParseConfig,
} from './favur-scraper.service';

const SINGLETON_ID = 'default';

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
    const config = await this.ensureRow();
    if (!config.enabled) {
      throw new BadRequestException(
        'Favur sync is disabled. Toggle it on in admin → integrations.',
      );
    }
    if (!config.activeCaptureId || !config.activeUrl || !config.activeHeaders || !config.activeCookies) {
      throw new BadRequestException(
        'No active capture from the extension yet. Install the Favur extension and log into web.favur.ch.',
      );
    }
    if (config.syncInProgress) return this.toDto(config);

    const claim = await this.prisma.favurIntegration.updateMany({
      where: { id: SINGLETON_ID, syncInProgress: false },
      data: { syncInProgress: true },
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
        data: { syncInProgress: false },
      });
    }

    return this.toDto(await this.ensureRow());
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
