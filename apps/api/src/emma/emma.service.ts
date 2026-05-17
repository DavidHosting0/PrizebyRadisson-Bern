import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import {
  SettingsService,
  type EmmaLoginStored,
} from '../settings/settings.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EMMA_DEFAULT_HOTEL_ID, EMMA_DEFAULT_SAP_CLIENT } from './emma-odata-client';
import { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpLogin, emmaHttpProbeOData } from './emma-http-auth';
import { emmaServerRoot, type EmmaLoginOpts } from './emma-login-types';
import {
  applyEmmaSnapshotsToRooms,
  fetchEmmaRoomStatusSnapshotsHttp,
  type EmmaRoomStatusSyncResult,
} from './emma-room-status-sync';

/**
 * EMMA integration: HTTP session + fast OData room-status sync.
 * Folio / reservation flows will be reimplemented without a browser.
 */
export type EmmaRoomSyncTriggerKind = 'cron' | 'action';

@Injectable()
export class EmmaService {
  private readonly log = new Logger(EmmaService.name);
  private backgroundSyncInProgress = false;
  private suppressActivityScheduling = false;
  private activityDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RoomsService))
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  getLoginMeta() {
    return this.settings.getEmmaLoginMeta();
  }

  async invalidateSession() {
    await this.settings.clearEmmaHttpSession();
    return { ok: true };
  }

  /**
   * Read-only: test whether the persisted cookie jar can obtain an OData CSRF
   * token (ZEYUI_RSRVS_SRV). Does not run login.
   */
  async probeStoredHttpSession(): Promise<{
    ok: boolean;
    reason?: string;
    cookieCount: number;
    savedAt?: string;
  }> {
    const stored = await this.settings.getEmmaHttpSession();
    if (!stored?.cookies?.length) {
      return { ok: false, reason: 'Keine gespeicherte EMMA-HTTP-Session.', cookieCount: 0 };
    }
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    const sapClient =
      creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
    const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });
    const jar = EmmaCookieJar.fromJSON(stored.cookies);
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    return {
      ok: probe.ok,
      ...(!probe.ok && { reason: probe.reason }),
      cookieCount: stored.cookies.length,
      savedAt: stored.savedAt,
    };
  }

  async refreshHttpSession(): Promise<{ ok: true; savedAt: string; cookieCount: number }> {
    const opts = await this.buildLoginOpts();
    const startedAt = Date.now();
    this.log.log('[EMMA] refreshHttpSession (HTTP) gestartet');
    const { jar, finalUrl } = await emmaHttpLogin(opts);
    const baseUrl = emmaServerRoot(opts);
    const sapClient =
      (await this.settings.getEmmaLoginSecrets())?.sapClient?.trim() ||
      process.env.EMMA_SAP_CLIENT?.trim() ||
      EMMA_DEFAULT_SAP_CLIENT;
    this.log.log(
      `[EMMA] refreshHttpSession nach Login: finalUrl=${finalUrl} cookies=${jar.toJSON().length}`,
    );
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    if (!probe.ok) {
      this.log.warn(`[EMMA] OData-Probe fehlgeschlagen: ${probe.reason}`);
      throw new Error(
        `EMMA HTTP-Login endete auf ${finalUrl}, aber OData-Probe fehlgeschlagen: ${probe.reason}. ` +
          'Prüfe TOTP/SAP/Operator (Stage 2–4) in Admin → EMMA.',
      );
    }
    this.log.log('[EMMA] OData-Probe OK (ZEYUI_RSRVS_SRV CSRF)');
    const savedAt = new Date().toISOString();
    await this.settings.saveEmmaHttpSession({ cookies: jar.toJSON(), savedAt });
    this.log.log(`[EMMA] refreshHttpSession OK (${Date.now() - startedAt}ms)`);
    return { ok: true, savedAt, cookieCount: jar.toJSON().length };
  }

  private async loadEmmaHttpJar(): Promise<EmmaCookieJar> {
    const stored = await this.settings.getEmmaHttpSession();
    if (!stored?.cookies?.length) {
      throw new Error(
        'Keine EMMA-HTTP-Session gespeichert. Admin: POST /api/v1/emma/session/refresh-http ausführen.',
      );
    }
    return EmmaCookieJar.fromJSON(stored.cookies);
  }

  /** Debounced sync after local room activity (checklist, clean, assign, …). */
  scheduleRoomStatusSync(source: string): void {
    if (this.suppressActivityScheduling) return;
    if (process.env.EMMA_AUTO_SYNC === 'false') return;
    const debounceMs = parseInt(process.env.EMMA_ACTION_SYNC_DEBOUNCE_MS ?? '20000', 10);
    if (this.activityDebounce) clearTimeout(this.activityDebounce);
    this.activityDebounce = setTimeout(() => {
      this.activityDebounce = null;
      void this.runBackgroundRoomStatusSync('action', source);
    }, debounceMs);
  }

  /**
   * Cron / post-action sync. Never throws — logs warnings only.
   * Reuses {@link syncRoomStatuses} (OData probe + optional refresh-http).
   */
  async runBackgroundRoomStatusSync(
    trigger: EmmaRoomSyncTriggerKind,
    source?: string,
  ): Promise<void> {
    if (process.env.EMMA_AUTO_SYNC === 'false') return;
    if (this.backgroundSyncInProgress) {
      this.log.debug(`[EMMA] auto sync skipped (${trigger}): already running`);
      return;
    }
    const creds = await this.settings.getEmmaLoginSecrets();
    if (!this.hasCompleteCredentials(creds)) {
      if (trigger === 'cron') {
        this.log.debug('[EMMA] auto sync skipped: EMMA credentials incomplete');
      }
      return;
    }
    const session = await this.settings.getEmmaHttpSession();
    if (!session?.cookies?.length) {
      this.log.debug(
        `[EMMA] auto sync skipped (${trigger}): no HTTP session — run refresh-http once in Admin → EMMA`,
      );
      return;
    }

    this.backgroundSyncInProgress = true;
    const label = source ? `${trigger}:${source}` : trigger;
    try {
      this.log.log(`[EMMA] auto room-status sync start (${label})`);
      await this.syncRoomStatuses({});
      this.log.log(`[EMMA] auto room-status sync OK (${label})`);
    } catch (err) {
      this.log.warn(`[EMMA] auto room-status sync failed (${label}): ${(err as Error).message}`);
    } finally {
      this.backgroundSyncInProgress = false;
    }
  }

  async syncRoomStatuses(
    runOpts: { hotelId?: string; forceAttempt?: boolean } = {},
  ): Promise<EmmaRoomStatusSyncResult> {
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    const hotelId =
      runOpts.hotelId?.trim() ||
      creds.hotelId?.trim() ||
      process.env.EMMA_HOTEL_ID?.trim() ||
      EMMA_DEFAULT_HOTEL_ID;
    const sapClient =
      creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
    const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });

    const startedAt = Date.now();
    this.log.log(`[EMMA] syncRoomStatuses (HTTP) gestartet (${hotelId})`);

    let jar = await this.loadEmmaHttpJar();
    if (!runOpts.forceAttempt) {
      const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
      if (!probe.ok) {
        this.log.warn(`[EMMA] HTTP-Session abgelaufen (${probe.reason}) — erneuter Login`);
        await this.refreshHttpSession();
        jar = await this.loadEmmaHttpJar();
      }
    } else {
      this.log.warn(
        '[EMMA] syncRoomStatuses forceAttempt=true — überspringe OData-Probe und Login; Sync schlägt fehl wenn Session ungültig.',
      );
    }

    const updatedRoomIds: string[] = [];
    this.suppressActivityScheduling = true;
    let result: EmmaRoomStatusSyncResult;
    try {
      const snapshots = await fetchEmmaRoomStatusSnapshotsHttp(jar, baseUrl, hotelId, sapClient);
      this.log.log(`[EMMA] ${snapshots.length} Zimmer aus RoomDetail (${Date.now() - startedAt}ms)`);

      result = await applyEmmaSnapshotsToRooms(
        {
          findRooms: () =>
            this.prisma.room.findMany({
              select: { id: true, roomNumber: true, metadata: true, outOfOrder: true },
            }),
          updateRoom: async (id, data) => {
            updatedRoomIds.push(id);
            await this.prisma.room.update({
              where: { id },
              data: {
                outOfOrder: data.outOfOrder,
                metadata: data.metadata as Prisma.InputJsonValue,
              },
            });
          },
        },
        snapshots,
        hotelId,
      );
    } finally {
      this.suppressActivityScheduling = false;
    }

    for (const id of updatedRoomIds) {
      try {
        const dto = await this.rooms.findOne(id);
        this.realtime.emitRoomStatus(dto);
      } catch {
        /* room removed mid-sync */
      }
    }

    this.log.log(
      `[EMMA] syncRoomStatuses OK in ${Date.now() - startedAt}ms: ${result.matched}/${result.emmaRooms} matched, ${result.updated} updated`,
    );
    return result;
  }

  private hasCompleteCredentials(creds: EmmaLoginStored | null): boolean {
    if (!creds) return false;
    return Boolean(
      creds.adfsEmail?.trim() &&
        creds.adfsPassword &&
        creds.totpSecret &&
        creds.sapUser?.trim() &&
        creds.sapPassword,
    );
  }

  private async buildLoginOpts(): Promise<EmmaLoginOpts> {
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    return {
      adfsEmail: creds.adfsEmail!,
      adfsPassword: creds.adfsPassword!,
      totpSecret: creds.totpSecret!,
      sapUser: creds.sapUser!.trim(),
      sapPassword: creds.sapPassword!.trim(),
      operatorCode: creds.operatorCode || undefined,
      operatorPassword: creds.operatorPassword || undefined,
      baseUrl: creds.baseUrl || undefined,
      hotelId: creds.hotelId || undefined,
      sapClient: creds.sapClient || undefined,
      progress: (msg) => this.log.log(msg),
    };
  }

  private assertCredentialsComplete(
    creds: EmmaLoginStored | null,
  ): asserts creds is Required<
    Pick<
      EmmaLoginStored,
      'adfsEmail' | 'adfsPassword' | 'totpSecret' | 'sapUser' | 'sapPassword'
    >
  > &
    EmmaLoginStored {
    if (!creds) {
      throw new Error(
        'EMMA-Zugangsdaten fehlen. Admin → Settings → EMMA Login.',
      );
    }
    const missing: string[] = [];
    if (!creds.adfsEmail?.trim()) missing.push('ADFS-E-Mail');
    if (!creds.adfsPassword) missing.push('ADFS-Passwort');
    if (!creds.totpSecret) missing.push('TOTP-Seed');
    if (!creds.sapUser?.trim()) missing.push('SAP-Benutzer');
    if (!creds.sapPassword) missing.push('SAP-Passwort');
    if (missing.length > 0) {
      throw new Error(
        `EMMA-Zugangsdaten unvollständig: ${missing.join(', ')}.`,
      );
    }
  }
}
