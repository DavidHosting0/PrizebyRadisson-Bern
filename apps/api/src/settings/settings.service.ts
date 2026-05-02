import { Injectable } from '@nestjs/common';
import type { HotelSettings, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdatePuzzleLoginDto } from './dto/update-puzzle-login.dto';

/** Stored under HotelSettings.settings JSON key `puzzelLogin` */
export type PuzzelLoginStored = {
  email?: string;
  password?: string;
  /** Base32 TOTP secret */
  totpSecret?: string;
};

const PUZZEL_KEY = 'puzzelLogin';
const PUZZEL_TICKET_SYNC_KEY = 'puzzelTicketSync';
const PUZZEL_TICKET_FILTER_KEY = 'puzzelTicketFilter';

export type PuzzelTicketSyncStored = {
  lastSyncedAt?: string | null;
  lastError?: string | null;
  lastTicketCount?: number;
  inProgress?: boolean;
};

export type PuzzelTicketFilterStored = {
  savedSearchName: string;
  teamName: string;
  statusName: string;
  timePeriod: string;
};

const DEFAULT_PUZZEL_TICKET_FILTER: PuzzelTicketFilterStored = {
  savedSearchName: "My Favourite Team's Open Tickets",
  teamName: 'PZ | Billing Bern',
  statusName: 'Open',
  timePeriod: 'All Time',
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureRow() {
    let row = await this.prisma.hotelSettings.findFirst();
    if (!row) {
      row = await this.prisma.hotelSettings.create({ data: {} });
    }
    return row;
  }

  /** Hotel row with secrets removed from `settings.puzzelLogin` */
  async get(): Promise<HotelSettings> {
    const row = await this.ensureRow();
    return {
      ...row,
      settings: this.sanitizeSettings(row.settings) as Prisma.JsonValue,
    };
  }

  async update(dto: { name?: string; timezone?: string; settings?: Record<string, unknown> }) {
    const current = await this.ensureRow();
    const nextSettings =
      dto.settings === undefined
        ? undefined
        : this.mergeHotelSettings(this.asRecord(current.settings), dto.settings);

    return this.prisma.hotelSettings.update({
      where: { id: current.id },
      data: {
        name: dto.name,
        timezone: dto.timezone,
        settings: nextSettings === undefined ? undefined : (nextSettings as object),
      },
    });
  }

  /** Public shape for admin UI (no raw password or TOTP seed) */
  async getPuzzelLoginMeta() {
    const row = await this.ensureRow();
    return this.metaFromSettings(row.settings);
  }

  async updatePuzzelLogin(dto: UpdatePuzzleLoginDto) {
    const current = await this.ensureRow();
    const s = this.asRecord(current.settings);
    const prevPl = this.parsePuzzel(s[PUZZEL_KEY]);
    const nextPl = this.mergePuzzelInput(prevPl, dto);

    const updated = await this.prisma.hotelSettings.update({
      where: { id: current.id },
      data: {
        settings: { ...s, puzzelLogin: nextPl } as object,
      },
    });
    return this.metaFromSettings(updated.settings);
  }

  /**
   * Full credentials for server-side automation (Playwright, cron, etc.).
   * Do not expose via HTTP to non-admin callers.
   */
  async getPuzzelLoginSecrets(): Promise<PuzzelLoginStored | null> {
    const row = await this.ensureRow();
    const pl = this.parsePuzzel(this.asRecord(row.settings)[PUZZEL_KEY]);
    if (!pl?.email?.trim()) return null;
    return {
      email: pl.email.trim(),
      password: typeof pl.password === 'string' ? pl.password : '',
      totpSecret: typeof pl.totpSecret === 'string' ? pl.totpSecret : '',
    };
  }

  async getPuzzelTicketSyncMeta(): Promise<PuzzelTicketSyncStored> {
    const row = await this.ensureRow();
    return this.parseTicketSync(this.asRecord(row.settings)[PUZZEL_TICKET_SYNC_KEY]);
  }

  async getPuzzelTicketFilter(): Promise<PuzzelTicketFilterStored> {
    const row = await this.ensureRow();
    return this.parseTicketFilter(this.asRecord(row.settings)[PUZZEL_TICKET_FILTER_KEY]);
  }

  async updatePuzzelTicketFilter(patch: Partial<PuzzelTicketFilterStored>) {
    const row = await this.ensureRow();
    const s = this.asRecord(row.settings);
    const prev = this.parseTicketFilter(s[PUZZEL_TICKET_FILTER_KEY]);
    const next = this.parseTicketFilter({ ...prev, ...patch });
    await this.prisma.hotelSettings.update({
      where: { id: row.id },
      data: {
        settings: { ...s, [PUZZEL_TICKET_FILTER_KEY]: next } as object,
      },
    });
    return next;
  }

  async mergePuzzelTicketSyncMeta(patch: Partial<PuzzelTicketSyncStored>) {
    const row = await this.ensureRow();
    const s = this.asRecord(row.settings);
    const prev = this.parseTicketSync(s[PUZZEL_TICKET_SYNC_KEY]);
    const next: PuzzelTicketSyncStored = { ...prev, ...patch };
    await this.prisma.hotelSettings.update({
      where: { id: row.id },
      data: {
        settings: { ...s, [PUZZEL_TICKET_SYNC_KEY]: next } as object,
      },
    });
  }

  private parseTicketSync(raw: unknown): PuzzelTicketSyncStored {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { inProgress: false, lastTicketCount: 0 };
    }
    const o = raw as Record<string, unknown>;
    return {
      lastSyncedAt: typeof o.lastSyncedAt === 'string' ? o.lastSyncedAt : o.lastSyncedAt === null ? null : undefined,
      lastError: typeof o.lastError === 'string' ? o.lastError : o.lastError === null ? null : undefined,
      lastTicketCount: typeof o.lastTicketCount === 'number' ? o.lastTicketCount : 0,
      inProgress: o.inProgress === true,
    };
  }

  private parseTicketFilter(raw: unknown): PuzzelTicketFilterStored {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return DEFAULT_PUZZEL_TICKET_FILTER;
    }
    const o = raw as Record<string, unknown>;
    return {
      savedSearchName:
        typeof o.savedSearchName === 'string' && o.savedSearchName.trim()
          ? o.savedSearchName.trim()
          : DEFAULT_PUZZEL_TICKET_FILTER.savedSearchName,
      teamName:
        typeof o.teamName === 'string' && o.teamName.trim()
          ? o.teamName.trim()
          : DEFAULT_PUZZEL_TICKET_FILTER.teamName,
      statusName:
        typeof o.statusName === 'string' && o.statusName.trim()
          ? o.statusName.trim()
          : DEFAULT_PUZZEL_TICKET_FILTER.statusName,
      timePeriod:
        typeof o.timePeriod === 'string' && o.timePeriod.trim()
          ? o.timePeriod.trim()
          : DEFAULT_PUZZEL_TICKET_FILTER.timePeriod,
    };
  }

  private asRecord(settings: unknown): Record<string, unknown> {
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      return settings as Record<string, unknown>;
    }
    return {};
  }

  private parsePuzzel(raw: unknown): Partial<PuzzelLoginStored> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Partial<PuzzelLoginStored>;
  }

  private mergePuzzelInput(
    prev: Partial<PuzzelLoginStored>,
    dto: UpdatePuzzleLoginDto,
  ): PuzzelLoginStored {
    const next: PuzzelLoginStored = { ...prev };
    if (dto.email !== undefined) {
      next.email = dto.email.trim();
    }
    if (dto.password !== undefined && dto.password.length > 0) {
      next.password = dto.password;
    }
    if (dto.totpSecret !== undefined) {
      const t = dto.totpSecret.trim().replace(/\s+/g, '');
      if (t.length > 0) {
        next.totpSecret = t;
      }
    }
    return next;
  }

  private mergePuzzelPartial(
    cur: Partial<PuzzelLoginStored>,
    patch: Record<string, unknown>,
  ): PuzzelLoginStored {
    const next: PuzzelLoginStored = { ...cur };
    const email = patch.email;
    if (typeof email === 'string') {
      next.email = email.trim();
    }
    const password = patch.password;
    if (typeof password === 'string' && password.length > 0) {
      next.password = password;
    }
    const totpSecret = patch.totpSecret;
    if (typeof totpSecret === 'string') {
      const t = totpSecret.trim().replace(/\s+/g, '');
      if (t.length > 0) {
        next.totpSecret = t;
      }
    }
    return next;
  }

  private mergeHotelSettings(
    current: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const next: Record<string, unknown> = { ...current };
    for (const [key, val] of Object.entries(patch)) {
      if (key === PUZZEL_KEY && val && typeof val === 'object' && !Array.isArray(val)) {
        const prevPl = this.parsePuzzel(next[PUZZEL_KEY]);
        next[PUZZEL_KEY] = this.mergePuzzelPartial(prevPl, val as Record<string, unknown>);
      } else {
        next[key] = val;
      }
    }
    return next;
  }

  private sanitizeSettings(settings: unknown): Record<string, unknown> {
    const raw = this.asRecord(settings);
    const out = { ...raw };
    if (raw[PUZZEL_KEY] && typeof raw[PUZZEL_KEY] === 'object' && !Array.isArray(raw[PUZZEL_KEY])) {
      out[PUZZEL_KEY] = this.metaFromPuzzel(raw[PUZZEL_KEY]);
    }
    return out;
  }

  private metaFromPuzzel(raw: unknown) {
    const pl = this.parsePuzzel(raw);
    return {
      email: typeof pl.email === 'string' && pl.email.trim() ? pl.email.trim() : null,
      hasPassword: typeof pl.password === 'string' && pl.password.length > 0,
      hasTotpSecret: typeof pl.totpSecret === 'string' && pl.totpSecret.length > 0,
    };
  }

  private metaFromSettings(settings: unknown) {
    return this.metaFromPuzzel(this.asRecord(settings)[PUZZEL_KEY]);
  }
}
