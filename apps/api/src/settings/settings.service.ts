import { Injectable } from '@nestjs/common';
import type { HotelSettings, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import type { UpdatePuzzleLoginDto } from './dto/update-puzzle-login.dto';
import type { UpdateEmmaLoginDto } from './dto/update-emma-login.dto';
import type { UpdateAiConfigDto } from './dto/update-ai-config.dto';

/** Stored under HotelSettings.settings JSON key `puzzelLogin` */
export type PuzzelLoginStored = {
  email?: string;
  password?: string;
  /** Base32 TOTP secret */
  totpSecret?: string;
};

/**
 * Plaintext shape of the EMMA credentials returned to the server-side
 * automation. The on-disk representation under `HotelSettings.settings.emmaLogin`
 * keeps the password/seed fields envelope-encrypted via SecretCipherService.
 */
export type EmmaLoginStored = {
  adfsEmail?: string;
  adfsPassword?: string;
  totpSecret?: string;
  sapUser?: string;
  sapPassword?: string;
  operatorCode?: string;
  operatorPassword?: string;
  baseUrl?: string;
};

/** Persisted shape (passwords/seed are AES-GCM ciphertext, base64). */
type EmmaLoginPersisted = {
  adfsEmail?: string;
  adfsPasswordEnc?: string;
  totpSecretEnc?: string;
  sapUser?: string;
  sapPasswordEnc?: string;
  operatorCode?: string;
  operatorPasswordEnc?: string;
  baseUrl?: string;
};

/** Plaintext shape of the AI config returned to server-side automation. */
export type AiConfigStored = {
  openaiApiKey?: string;
  openaiModel?: string;
};

/** Persisted shape (api key is AES-GCM ciphertext, base64). */
type AiConfigPersisted = {
  openaiApiKeyEnc?: string;
  openaiModel?: string;
};

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

const PUZZEL_KEY = 'puzzelLogin';
const PUZZEL_TICKET_SYNC_KEY = 'puzzelTicketSync';
const PUZZEL_TICKET_FILTER_KEY = 'puzzelTicketFilter';
const EMMA_KEY = 'emmaLogin';
const AI_KEY = 'aiConfig';

export type PuzzelTicketSyncStored = {
  lastSyncedAt?: string | null;
  lastError?: string | null;
  lastTicketCount?: number;
  inProgress?: boolean;
  startedAt?: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
  ) {}

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

  // ------------------------- EMMA login ------------------------------------

  /** Public shape for the admin UI (no plaintext secrets). */
  async getEmmaLoginMeta() {
    const row = await this.ensureRow();
    return this.metaFromEmmaRaw(this.asRecord(row.settings)[EMMA_KEY]);
  }

  async updateEmmaLogin(dto: UpdateEmmaLoginDto) {
    const current = await this.ensureRow();
    const s = this.asRecord(current.settings);
    const prev = this.parseEmmaPersisted(s[EMMA_KEY]);
    const next = this.mergeEmmaInput(prev, dto);

    const updated = await this.prisma.hotelSettings.update({
      where: { id: current.id },
      data: {
        settings: { ...s, [EMMA_KEY]: next } as object,
      },
    });
    return this.metaFromEmmaRaw(this.asRecord(updated.settings)[EMMA_KEY]);
  }

  // ------------------------- AI / OpenAI config ----------------------------

  /** Public shape for the admin UI (no plaintext API key). */
  async getAiConfigMeta() {
    const row = await this.ensureRow();
    return this.metaFromAiRaw(this.asRecord(row.settings)[AI_KEY]);
  }

  async updateAiConfig(dto: UpdateAiConfigDto) {
    const current = await this.ensureRow();
    const s = this.asRecord(current.settings);
    const prev = this.parseAiPersisted(s[AI_KEY]);
    const next = this.mergeAiInput(prev, dto);

    const updated = await this.prisma.hotelSettings.update({
      where: { id: current.id },
      data: {
        settings: { ...s, [AI_KEY]: next } as object,
      },
    });
    return this.metaFromAiRaw(this.asRecord(updated.settings)[AI_KEY]);
  }

  /**
   * Plaintext API key + model for server-side use. Returns null if no API key
   * is configured.
   */
  async getAiConfigSecrets(): Promise<AiConfigStored | null> {
    const row = await this.ensureRow();
    const persisted = this.parseAiPersisted(this.asRecord(row.settings)[AI_KEY]);
    const apiKey = this.cipher.decryptSafe(persisted.openaiApiKeyEnc);
    if (!apiKey?.trim()) return null;
    return {
      openaiApiKey: apiKey.trim(),
      openaiModel: persisted.openaiModel?.trim() || DEFAULT_OPENAI_MODEL,
    };
  }

  /**
   * Full EMMA credentials for server-side automation. Decrypts the encrypted
   * fields. Returns null if no EMMA login has been configured yet.
   */
  async getEmmaLoginSecrets(): Promise<EmmaLoginStored | null> {
    const row = await this.ensureRow();
    const persisted = this.parseEmmaPersisted(this.asRecord(row.settings)[EMMA_KEY]);
    if (!persisted.adfsEmail?.trim() && !persisted.sapUser?.trim()) {
      return null;
    }
    return {
      adfsEmail: persisted.adfsEmail?.trim() || undefined,
      adfsPassword: this.cipher.decryptSafe(persisted.adfsPasswordEnc) ?? undefined,
      totpSecret: this.cipher.decryptSafe(persisted.totpSecretEnc) ?? undefined,
      sapUser: persisted.sapUser?.trim() || undefined,
      sapPassword: this.cipher.decryptSafe(persisted.sapPasswordEnc) ?? undefined,
      operatorCode: persisted.operatorCode?.trim() || undefined,
      operatorPassword:
        this.cipher.decryptSafe(persisted.operatorPasswordEnc) ?? undefined,
      baseUrl: persisted.baseUrl?.trim() || undefined,
    };
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
      startedAt: typeof o.startedAt === 'string' ? o.startedAt : o.startedAt === null ? null : undefined,
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
      } else if (key === EMMA_KEY) {
        // Encrypted EMMA blob is not patchable through the generic settings
        // endpoint — admins must use the dedicated /settings/emma-login route
        // so credentials get encrypted properly. Drop the patch silently.
        continue;
      } else if (key === AI_KEY) {
        // Same rule for the AI/OpenAI key — must go through /settings/ai-config.
        continue;
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
    if (raw[EMMA_KEY] && typeof raw[EMMA_KEY] === 'object' && !Array.isArray(raw[EMMA_KEY])) {
      out[EMMA_KEY] = this.metaFromEmmaRaw(raw[EMMA_KEY]);
    }
    if (raw[AI_KEY] && typeof raw[AI_KEY] === 'object' && !Array.isArray(raw[AI_KEY])) {
      out[AI_KEY] = this.metaFromAiRaw(raw[AI_KEY]);
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

  // ------------------------- EMMA helpers -----------------------------------

  private parseEmmaPersisted(raw: unknown): EmmaLoginPersisted {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const o = raw as Record<string, unknown>;
    const pickStr = (k: string): string | undefined =>
      typeof o[k] === 'string' ? (o[k] as string) : undefined;
    return {
      adfsEmail: pickStr('adfsEmail'),
      adfsPasswordEnc: pickStr('adfsPasswordEnc'),
      totpSecretEnc: pickStr('totpSecretEnc'),
      sapUser: pickStr('sapUser'),
      sapPasswordEnc: pickStr('sapPasswordEnc'),
      operatorCode: pickStr('operatorCode'),
      operatorPasswordEnc: pickStr('operatorPasswordEnc'),
      baseUrl: pickStr('baseUrl'),
    };
  }

  private mergeEmmaInput(
    prev: EmmaLoginPersisted,
    dto: UpdateEmmaLoginDto,
  ): EmmaLoginPersisted {
    const next: EmmaLoginPersisted = { ...prev };
    if (dto.adfsEmail !== undefined) next.adfsEmail = dto.adfsEmail.trim();
    if (dto.sapUser !== undefined) next.sapUser = dto.sapUser.trim();
    if (dto.operatorCode !== undefined) next.operatorCode = dto.operatorCode.trim();
    if (dto.baseUrl !== undefined) {
      const v = dto.baseUrl.trim();
      next.baseUrl = v.length > 0 ? v : undefined;
    }
    if (dto.adfsPassword !== undefined && dto.adfsPassword.length > 0) {
      next.adfsPasswordEnc = this.cipher.encrypt(dto.adfsPassword);
    }
    if (dto.totpSecret !== undefined) {
      const t = dto.totpSecret.trim().replace(/\s+/g, '');
      if (t.length > 0) next.totpSecretEnc = this.cipher.encrypt(t);
    }
    if (dto.sapPassword !== undefined && dto.sapPassword.length > 0) {
      next.sapPasswordEnc = this.cipher.encrypt(dto.sapPassword);
    }
    if (dto.operatorPassword !== undefined && dto.operatorPassword.length > 0) {
      next.operatorPasswordEnc = this.cipher.encrypt(dto.operatorPassword);
    }
    return next;
  }

  private metaFromEmmaRaw(raw: unknown) {
    const p = this.parseEmmaPersisted(raw);
    return {
      adfsEmail: p.adfsEmail?.trim() || null,
      sapUser: p.sapUser?.trim() || null,
      operatorCode: p.operatorCode?.trim() || null,
      baseUrl: p.baseUrl?.trim() || null,
      hasAdfsPassword: !!p.adfsPasswordEnc,
      hasTotpSecret: !!p.totpSecretEnc,
      hasSapPassword: !!p.sapPasswordEnc,
      hasOperatorPassword: !!p.operatorPasswordEnc,
    };
  }

  // ------------------------- AI helpers -----------------------------------

  private parseAiPersisted(raw: unknown): AiConfigPersisted {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const o = raw as Record<string, unknown>;
    return {
      openaiApiKeyEnc:
        typeof o.openaiApiKeyEnc === 'string' ? o.openaiApiKeyEnc : undefined,
      openaiModel:
        typeof o.openaiModel === 'string' ? o.openaiModel : undefined,
    };
  }

  private mergeAiInput(
    prev: AiConfigPersisted,
    dto: UpdateAiConfigDto,
  ): AiConfigPersisted {
    const next: AiConfigPersisted = { ...prev };
    if (dto.openaiApiKey !== undefined && dto.openaiApiKey.trim().length > 0) {
      next.openaiApiKeyEnc = this.cipher.encrypt(dto.openaiApiKey.trim());
    }
    if (dto.openaiModel !== undefined) {
      const m = dto.openaiModel.trim();
      next.openaiModel = m.length > 0 ? m : undefined;
    }
    return next;
  }

  private metaFromAiRaw(raw: unknown) {
    const p = this.parseAiPersisted(raw);
    return {
      hasOpenaiApiKey: !!p.openaiApiKeyEnc,
      openaiModel: p.openaiModel?.trim() || DEFAULT_OPENAI_MODEL,
    };
  }
}
