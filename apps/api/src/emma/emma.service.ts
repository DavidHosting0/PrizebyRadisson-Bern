import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  mapEmmaToDerivedStatus,
  type EmmaRoomStatusSyncResult,
} from './emma-room-status-sync';
import { createEmmaSyncDebug } from './emma-sync-debug';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import {
  syncEmmaReservationsFromJar,
  type EmmaReservationSyncResult,
  type ReservationUpsertRow,
} from './emma-reservation-sync';
import { fetchEmmaReservationDetailFromJar } from './emma-reservation-detail-fetch';
import { fetchEmmaReservationFolioFromJar } from './emma-reservation-folio-fetch';
import { moveEmmaFolioChargeFromJar, moveEmmaFolioChargesFromJar } from './emma-folio-move-charge';
import { clearStaleEmmaFolioPostBlock } from './emma-folio-edit-session';
import {
  settleEmmaFolioWithVcc,
  type EmmaVccPaymentOutcome,
} from './emma-folio-payment';
import { EmmaMutationLock } from './emma-mutation-lock';
import {
  emmaCodeToDerivedStatus,
  formatEmmaRoomId,
  mapDerivedStatusToEmmaCode,
  pushEmmaRoomStatusHttp,
  type EmmaRoomStatusPushTarget,
} from './emma-room-status-push';
import { readEmmaMetadata } from './emma-room-status-sync';
import { EmmaIntegrationAlertService } from './emma-integration-alert.service';
import { EmmaBackupModeService } from './emma-backup-mode.service';
import { EmmaPushOutboxService } from './emma-push-outbox.service';
import type {
  EmmaMoveFolioChargeParams,
  EmmaMoveFolioChargeResult,
  EmmaMoveFolioChargesParams,
} from '@housekeeping/shared';
import { todayIsoDate } from '../reservations/reservation-sensitive';

/**
 * EMMA integration: HTTP session + fast OData room-status sync.
 * Folio / reservation flows will be reimplemented without a browser.
 */
export type EmmaRoomSyncTriggerKind = 'cron' | 'action' | 'view';

export type EmmaRoomStatusPushResult = {
  ok: boolean;
  skipped?: 'disabled' | 'before_cutover' | 'already_synced' | 'no_code';
  error?: string;
};

export type EmmaRoomStatusPushOpts = {
  actionAt: Date;
  source: string;
  /** Retry from outbox — still respects cutover via stored actionAt. */
  fromOutbox?: boolean;
};

@Injectable()
export class EmmaService {
  private readonly log = new Logger(EmmaService.name);
  private readonly mutationLock = new EmmaMutationLock();
  private backgroundSyncInProgress = false;
  private suppressActivityScheduling = false;
  private activityDebounce: ReturnType<typeof setTimeout> | null = null;
  private viewDebounce: ReturnType<typeof setTimeout> | null = null;
  private viewSyncNotBefore = 0;

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly config: ConfigService,
    private readonly integrationAlert: EmmaIntegrationAlertService,
    private readonly backupMode: EmmaBackupModeService,
    @Inject(forwardRef(() => RoomsService))
    private readonly rooms: RoomsService,
    @Inject(forwardRef(() => EmmaPushOutboxService))
    private readonly pushOutbox: EmmaPushOutboxService,
    private readonly realtime: RealtimeGateway,
  ) {}

  getLoginMeta() {
    return this.settings.getEmmaLoginMeta();
  }

  async invalidateSession() {
    await this.settings.clearEmmaHttpSession();
    this.clearPendingSyncTimers();
    return { ok: true };
  }

  private clearPendingSyncTimers(): void {
    if (this.activityDebounce) {
      clearTimeout(this.activityDebounce);
      this.activityDebounce = null;
    }
    if (this.viewDebounce) {
      clearTimeout(this.viewDebounce);
      this.viewDebounce = null;
    }
  }

  private async isIntegrationActive(): Promise<boolean> {
    if (!(await this.settings.isEmmaIntegrationEnabled())) return false;
    if (process.env.EMMA_AUTO_SYNC === 'false') return false;
    return true;
  }

  private async assertIntegrationActive(): Promise<void> {
    if (!(await this.settings.isEmmaIntegrationEnabled())) {
      throw new ForbiddenException(
        'EMMA-Integration ist deaktiviert. Admin → EMMA → „EMMA-Integration aktiv“ einschalten.',
      );
    }
    if (process.env.EMMA_AUTO_SYNC === 'false') {
      throw new ForbiddenException(
        'EMMA ist per Server-Konfiguration deaktiviert (EMMA_AUTO_SYNC=false).',
      );
    }
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
    await this.assertIntegrationActive();
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
    const debounceMs = parseInt(process.env.EMMA_ACTION_SYNC_DEBOUNCE_MS ?? '20000', 10);
    if (this.activityDebounce) clearTimeout(this.activityDebounce);
    this.activityDebounce = setTimeout(() => {
      this.activityDebounce = null;
      void this.runBackgroundRoomStatusSync('action', source);
    }, debounceMs);
  }

  /**
   * Pull EMMA when someone opens a room board / floor plan (GET /rooms).
   * Debounced + throttled so 15s React Query refetches do not hammer EMMA.
   */
  scheduleRoomStatusSyncOnView(source: string): void {
    if (this.suppressActivityScheduling) return;
    if (this.backgroundSyncInProgress) return;

    const now = Date.now();
    if (now < this.viewSyncNotBefore) return;
    if (this.viewDebounce) return;

    const debounceMs = parseInt(process.env.EMMA_VIEW_SYNC_DEBOUNCE_MS ?? '5000', 10);
    const minIntervalMs = parseInt(process.env.EMMA_VIEW_SYNC_MIN_INTERVAL_MS ?? '90000', 10);

    this.viewDebounce = setTimeout(() => {
      this.viewDebounce = null;
      if (Date.now() < this.viewSyncNotBefore) return;
      this.viewSyncNotBefore = Date.now() + minIntervalMs;
      void this.runBackgroundRoomStatusSync('view', source);
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
    if (!(await this.isIntegrationActive())) return;
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
      const msg = (err as Error).message;
      this.log.warn(`[EMMA] auto room-status sync failed (${label}): ${msg}`);
      this.log.warn(
        '[EMMA] Tipp: EMMA_DEBUG=true setzen und pm2 restart — Logs zeigen dann $batch-Label, Pfade und Parsing.',
      );
      try {
        await this.settings.mergeEmmaRoomStatusSyncMeta({ lastError: msg });
      } catch {
        /* ignore meta persistence failures */
      }
    } finally {
      this.backgroundSyncInProgress = false;
    }
  }

  async syncRoomStatuses(
    runOpts: { hotelId?: string; forceAttempt?: boolean } = {},
  ): Promise<EmmaRoomStatusSyncResult> {
    await this.assertIntegrationActive();
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
    const emmaDebug = createEmmaSyncDebug(this.log);
    if (emmaDebug.verbose) {
      this.log.log('[EMMA] EMMA_DEBUG=verbose — ausführliche OData/Batch-Logs aktiv');
    }
    try {
      const snapshots = await fetchEmmaRoomStatusSnapshotsHttp(
        jar,
        baseUrl,
        hotelId,
        sapClient,
        emmaDebug,
      );
      this.log.log(`[EMMA] ${snapshots.length} Zimmer aus EMMA (${Date.now() - startedAt}ms)`);
      const unmapped = snapshots.filter((s) => !mapEmmaToDerivedStatus(s));
      if (unmapped.length > 0) {
        const codes = [...new Set(unmapped.map((s) => s.statusCode ?? '?'))].slice(0, 12);
        this.log.warn(
          `[EMMA] ${unmapped.length} Zimmer ohne Status-Mapping (EMMA-Codes: ${codes.join(', ')})`,
        );
      }
      const byDerived = new Map<string, number>();
      for (const s of snapshots) {
        const d = mapEmmaToDerivedStatus(s) ?? 'UNMAPPED';
        byDerived.set(d, (byDerived.get(d) ?? 0) + 1);
      }
      this.log.log(
        `[EMMA] Status-Mapping: ${[...byDerived.entries()].map(([k, n]) => `${k}=${n}`).join(', ')}`,
      );
      if (emmaDebug.verbose && snapshots.length > 0) {
        const sample = snapshots
          .slice(0, 5)
          .map(
            (s) =>
              `${s.roomNumber}→${mapEmmaToDerivedStatus(s) ?? '?'}(${s.statusCode ?? '-'})`,
          )
          .join(', ');
        this.log.log(`[EMMA debug] Beispiel-Mapping: ${sample}`);
      }

      result = await applyEmmaSnapshotsToRooms(
        {
          findRooms: () =>
            this.prisma.room.findMany({
              select: { id: true, roomNumber: true, metadata: true, outOfOrder: true },
            }),
          updateRoom: async (id, data, meta) => {
            if (meta.statusChanged) updatedRoomIds.push(id);
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

    try {
      await this.settings.mergeEmmaRoomStatusSyncMeta({
        lastSyncedAt: result.syncedAt,
        lastError: null,
        matched: result.matched,
        updated: result.updated,
      });
    } catch (err) {
      this.log.warn(
        `[EMMA] could not persist room-status sync meta: ${(err as Error).message}`,
      );
    }

    this.log.log(
      `[EMMA] syncRoomStatuses OK in ${Date.now() - startedAt}ms: ${result.matched}/${result.emmaRooms} matched, ${result.updated} updated`,
    );
    return result;
  }

  async getIntegrationStatus() {
    const [pushAlert, backupMode] = await Promise.all([
      this.integrationAlert.getState(),
      this.backupMode.getState(),
    ]);
    return {
      backupMode,
      pushAlert,
      message: backupMode.active ? 'EMMA DOWN — BACKUP SYSTEM' : null,
    };
  }

  async setBackupModeManual(manual: boolean, userId: string) {
    await this.backupMode.setManual(manual, userId);
    await this.broadcastIntegrationStatus();
    return this.getIntegrationStatus();
  }

  async broadcastIntegrationStatus() {
    const status = await this.getIntegrationStatus();
    this.realtime.emitEmmaIntegrationAlert(status);
    return status;
  }

  /**
   * Push housekeeping status to EMMA (MERGE RoomDetail). Only for live actions after cutover.
   */
  async pushRoomStatus(
    roomId: string,
    target: EmmaRoomStatusPushTarget,
    opts: EmmaRoomStatusPushOpts,
  ): Promise<EmmaRoomStatusPushResult> {
    if (this.config.get<string>('emma.roomStatusPush') === 'false') {
      return { ok: true, skipped: 'disabled' };
    }

    const pushSinceRaw = this.config.get<string>('emma.roomStatusPushSince');
    const pushSince = pushSinceRaw ? new Date(pushSinceRaw) : null;
    if (pushSince && !Number.isNaN(pushSince.getTime()) && opts.actionAt < pushSince) {
      return { ok: true, skipped: 'before_cutover' };
    }

    const code = mapDerivedStatusToEmmaCode(target);
    if (!code) return { ok: true, skipped: 'no_code' };

    try {
      if (!(await this.isIntegrationActive())) {
        throw new Error('EMMA integration inactive');
      }

      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: { id: true, roomNumber: true, metadata: true },
      });
      if (!room) throw new Error('Room not found');

      const emmaMeta = readEmmaMetadata(room.metadata);
      const emmaRoomId = formatEmmaRoomId(room.roomNumber, emmaMeta?.roomId);
      if (emmaMeta?.statusCode === code) {
        return { ok: true, skipped: 'already_synced' };
      }

      const creds = await this.settings.getEmmaLoginSecrets();
      this.assertCredentialsComplete(creds);

      const hotelId =
        creds.hotelId?.trim() ||
        process.env.EMMA_HOTEL_ID?.trim() ||
        EMMA_DEFAULT_HOTEL_ID;
      const sapClient =
        creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
      const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });

      await this.mutationLock.run(async () => {
        let jar = await this.loadEmmaHttpJar();
        const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
        if (!probe.ok) {
          this.log.warn(`[EMMA push] session expired (${probe.reason}) — refresh`);
          await this.refreshHttpSession();
          jar = await this.loadEmmaHttpJar();
        }
        const emmaDebug = createEmmaSyncDebug(this.log);
        await pushEmmaRoomStatusHttp(
          jar,
          baseUrl,
          hotelId,
          sapClient,
          emmaRoomId,
          code,
          emmaDebug,
        );
      });

      const syncedAt = new Date().toISOString();
      const prevMeta =
        room.metadata && typeof room.metadata === 'object' && !Array.isArray(room.metadata)
          ? (room.metadata as Record<string, unknown>)
          : {};
      const prevEmma = emmaMeta ?? {
        roomId: emmaRoomId,
        statusCode: null,
        statusLabel: null,
        derivedStatus: null,
        outOfOrder: false,
        floorId: null,
        buildingId: '01',
        syncedAt: '',
      };
      const nextEmma = {
        ...prevEmma,
        roomId: emmaRoomId,
        statusCode: code,
        derivedStatus: emmaCodeToDerivedStatus(code),
        syncedAt,
      };
      const nextMeta = {
        ...prevMeta,
        emma: nextEmma,
        emmaPush: {
          lastPushAt: syncedAt,
          lastPushCode: code,
          lastPushOk: true,
          source: opts.source,
        },
      };
      await this.prisma.room.update({
        where: { id: roomId },
        data: { metadata: nextMeta as Prisma.InputJsonValue },
      });

      try {
        const dto = await this.rooms.findOne(roomId);
        this.realtime.emitRoomStatus(dto);
      } catch {
        /* room removed */
      }

      await this.integrationAlert.syncFromOutbox();
      this.emitIntegrationAlert();

      this.log.log(`[EMMA push] OK room=${room.roomNumber} → ${code} (${opts.source})`);
      return { ok: true };
    } catch (err) {
      const error = (err as Error).message;
      this.log.warn(`[EMMA push] failed room=${roomId} (${opts.source}): ${error}`);
      if (!opts.fromOutbox) {
        try {
          await this.pushOutbox.enqueue(roomId, code, opts.source, opts.actionAt, error);
          this.emitIntegrationAlert();
        } catch (enqueueErr) {
          this.log.warn(`[EMMA push] outbox enqueue failed: ${(enqueueErr as Error).message}`);
        }
      }
      return { ok: false, error };
    }
  }

  private emitIntegrationAlert(): void {
    void this.broadcastIntegrationStatus();
  }

  async retryFailedRoomStatusPushes(): Promise<void> {
    if (this.config.get<string>('emma.roomStatusPush') === 'false') return;
    await this.pushOutbox.processDue();
  }

  /** Fetch reservation rows from EMMA Check-In OData (no DB write). */
  async fetchReservationRowsFromEmma(
    runOpts: { hotelId?: string; arrivalDateIso?: string } = {},
  ): Promise<{
    rows: import('./emma-reservation-sync').ReservationUpsertRow[];
    membership: import('./emma-reservation-sync').EmmaCheckInTabMembership;
    result: import('./emma-reservation-sync').EmmaReservationSyncResult;
  }> {
    await this.assertIntegrationActive();
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

    let jar = await this.loadEmmaHttpJar();
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    if (!probe.ok) {
      this.log.warn(`[Reservations] HTTP session expired (${probe.reason}) — refresh`);
      await this.refreshHttpSession();
      jar = await this.loadEmmaHttpJar();
    }

    const emmaDebug = createEmmaSyncDebug(this.log);
    return syncEmmaReservationsFromJar(jar, baseUrl, this.cipher, {
      hotelId,
      sapClient,
      arrivalDateIso: runOpts.arrivalDateIso,
      debug: emmaDebug.verbose ? emmaDebug : undefined,
    });
  }

  /** Read-only EMMA reservation detail (main entity + nav properties). No draft/lock. */
  async fetchReservationDetailFromEmma(
    reservationId: string,
    hotelId?: string,
  ) {
    await this.assertIntegrationActive();
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    const hid =
      hotelId?.trim() ||
      creds.hotelId?.trim() ||
      process.env.EMMA_HOTEL_ID?.trim() ||
      EMMA_DEFAULT_HOTEL_ID;
    const sapClient =
      creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
    const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });

    let jar = await this.loadEmmaHttpJar();
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    if (!probe.ok) {
      this.log.warn(`[Reservations] HTTP session expired (${probe.reason}) — refresh`);
      await this.refreshHttpSession();
      jar = await this.loadEmmaHttpJar();
    }

    const emmaDebug = createEmmaSyncDebug(this.log);
    return fetchEmmaReservationDetailFromJar(jar, baseUrl, this.cipher, {
      hotelId: hid,
      reservationId,
      sapClient,
      debug: emmaDebug.verbose ? emmaDebug : undefined,
    });
  }

  /** Read-only EMMA Folio Management (folios, charges, amounts). No draft/lock. */
  async fetchReservationFolioFromEmma(reservationId: string, hotelId?: string) {
    await this.assertIntegrationActive();
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    const hid =
      hotelId?.trim() ||
      creds.hotelId?.trim() ||
      process.env.EMMA_HOTEL_ID?.trim() ||
      EMMA_DEFAULT_HOTEL_ID;
    const sapClient =
      creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
    const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });

    let jar = await this.loadEmmaHttpJar();
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    if (!probe.ok) {
      this.log.warn(`[Reservations] HTTP session expired (${probe.reason}) — refresh`);
      await this.refreshHttpSession();
      jar = await this.loadEmmaHttpJar();
    }

    const emmaDebug = createEmmaSyncDebug(this.log);
    return fetchEmmaReservationFolioFromJar(jar, baseUrl, this.cipher, {
      hotelId: hid,
      reservationId,
      sapClient,
      debug: emmaDebug.verbose ? emmaDebug : undefined,
    });
  }

  /** Move one folio charge (Folio Management → MoveCharge). Requires operator login in EMMA settings. */
  async moveFolioCharge(
    params: EmmaMoveFolioChargeParams & { hotelId?: string },
  ): Promise<EmmaMoveFolioChargeResult> {
    await this.assertIntegrationActive();
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    const operatorCode = creds.operatorCode?.trim();
    if (!operatorCode) {
      throw new ForbiddenException(
        'EMMA Operator-Code fehlt (Admin → EMMA Login). Für MoveCharge erforderlich.',
      );
    }
    // Outer guard against cross-reservation moves before we even open a session.
    const destReservation =
      (params.destinationReservationId ?? params.reservationId).trim();
    if (destReservation && destReservation !== params.reservationId.trim()) {
      throw new ForbiddenException(
        `Cross-Reservation-Move nicht erlaubt (${params.reservationId} → ${destReservation}).`,
      );
    }
    const hid =
      params.hotelId?.trim() ||
      creds.hotelId?.trim() ||
      process.env.EMMA_HOTEL_ID?.trim() ||
      EMMA_DEFAULT_HOTEL_ID;
    const sapClient =
      creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
    const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });

    let jar = await this.loadEmmaHttpJar();
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    if (!probe.ok) {
      this.log.warn(`[EMMA] HTTP session expired (${probe.reason}) — refresh`);
      await this.refreshHttpSession();
      jar = await this.loadEmmaHttpJar();
    }

    // Pre-flight audit (before the mutex). A grep for [EMMA-MOVE-AUDIT] gives
    // the full move history including source/destination reservation, folios
    // and charge row id — the data the user wants to be able to reconcile.
    this.log.log(
      `[EMMA-MOVE-AUDIT] moveFolioCharge requested reservation=${params.reservationId} ` +
        `chargeRow=${params.chargeRowId} ${params.sourceFolioId}→${params.destinationFolioId} ` +
        `destReservation=${destReservation} hotel=${hid}`,
    );

    const emmaDebug = createEmmaSyncDebug(this.log);
    return this.mutationLock.run(() =>
      moveEmmaFolioChargeFromJar(jar, baseUrl, {
        ...params,
        hotelId: hid,
        employee: params.employee ?? operatorCode,
        sapClient,
        debug: emmaDebug.verbose ? emmaDebug : undefined,
      }),
    );
  }

  /** Move multiple folio charges in one EMMA edit session (arrival check batch). */
  async moveFolioCharges(
    params: EmmaMoveFolioChargesParams & { hotelId?: string },
  ): Promise<EmmaMoveFolioChargeResult[]> {
    await this.assertIntegrationActive();
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    const operatorCode = creds.operatorCode?.trim();
    if (!operatorCode) {
      throw new ForbiddenException(
        'EMMA Operator-Code fehlt (Admin → EMMA Login). Für MoveCharge erforderlich.',
      );
    }
    if (params.moves.length === 0) {
      throw new BadRequestException('At least one charge move required');
    }
    for (const move of params.moves) {
      const destReservation = (move.destinationReservationId ?? params.reservationId).trim();
      if (destReservation && destReservation !== params.reservationId.trim()) {
        throw new ForbiddenException(
          `Cross-Reservation-Move nicht erlaubt (${params.reservationId} → ${destReservation}).`,
        );
      }
    }
    const hid =
      params.hotelId?.trim() ||
      creds.hotelId?.trim() ||
      process.env.EMMA_HOTEL_ID?.trim() ||
      EMMA_DEFAULT_HOTEL_ID;
    const sapClient =
      creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
    const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });

    let jar = await this.loadEmmaHttpJar();
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    if (!probe.ok) {
      this.log.warn(`[EMMA] HTTP session expired (${probe.reason}) — refresh`);
      await this.refreshHttpSession();
      jar = await this.loadEmmaHttpJar();
    }

    const moveSummary = params.moves
      .map((m) => `${m.chargeRowId}:${m.sourceFolioId}→${m.destinationFolioId}`)
      .join(', ');
    this.log.log(
      `[EMMA-MOVE-AUDIT] moveFolioCharges requested reservation=${params.reservationId} ` +
        `moves=${params.moves.length} [${moveSummary}] hotel=${hid}`,
    );

    const emmaDebug = createEmmaSyncDebug(this.log);
    return this.mutationLock.run(() =>
      moveEmmaFolioChargesFromJar(jar, baseUrl, {
        ...params,
        hotelId: hid,
        employee: params.employee ?? operatorCode,
        sapClient,
        debug: emmaDebug.verbose ? emmaDebug : undefined,
      }),
    );
  }

  /** Clear open folio draft / lock before invoicing when EMMA reports draft state. */
  async clearStaleFolioPostBlock(params: {
    hotelId?: string;
    reservationId: string;
    requestObjectKey?: string;
  }): Promise<void> {
    await this.assertIntegrationActive();
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    const operatorCode = creds.operatorCode?.trim();
    if (!operatorCode) {
      throw new ForbiddenException('EMMA Operator-Code fehlt.');
    }
    const hid =
      params.hotelId?.trim() ||
      creds.hotelId?.trim() ||
      process.env.EMMA_HOTEL_ID?.trim() ||
      EMMA_DEFAULT_HOTEL_ID;
    const sapClient =
      creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
    const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });
    const jar = await this.loadEmmaHttpJar();
    const emmaDebug = createEmmaSyncDebug(this.log);
    await this.mutationLock.run(() =>
      clearStaleEmmaFolioPostBlock(
        jar,
        baseUrl,
        hid,
        params.reservationId.trim(),
        operatorCode,
        sapClient,
        emmaDebug.verbose ? emmaDebug : undefined,
        params.requestObjectKey ? { requestObjectKey: params.requestObjectKey } : undefined,
      ),
    );
  }

  /**
   * Only ever charges a card identified as a VCC — never a personal card.
   */
  async payFolioWithVcc(params: {
    hotelId?: string;
    reservationId: string;
    folioId: string;
    amount: string;
    currency: string;
  }): Promise<EmmaVccPaymentOutcome> {
    await this.assertIntegrationActive();
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    const operatorCode = creds.operatorCode?.trim();
    if (!operatorCode) {
      throw new ForbiddenException(
        'EMMA Operator-Code fehlt (Admin → EMMA Login). Für VCC-Zahlung erforderlich.',
      );
    }
    const hid =
      params.hotelId?.trim() ||
      creds.hotelId?.trim() ||
      process.env.EMMA_HOTEL_ID?.trim() ||
      EMMA_DEFAULT_HOTEL_ID;
    const sapClient =
      creds.sapClient?.trim() || process.env.EMMA_SAP_CLIENT?.trim() || EMMA_DEFAULT_SAP_CLIENT;
    const baseUrl = emmaServerRoot({ baseUrl: creds.baseUrl ?? undefined });

    let jar = await this.loadEmmaHttpJar();
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    if (!probe.ok) {
      this.log.warn(`[EMMA] HTTP session expired (${probe.reason}) — refresh`);
      await this.refreshHttpSession();
      jar = await this.loadEmmaHttpJar();
    }

    // Pre-flight audit (before the mutex). Captures EXACTLY what the API layer
    // received from the orchestrator — so a future investigation can compare
    // "what was requested" against "what was charged" in EMMA.
    this.log.log(
      `[EMMA-VCC-AUDIT] payFolioWithVcc requested reservation=${params.reservationId} ` +
        `folio=${params.folioId} amount=${params.amount} ${params.currency} hotel=${hid}`,
    );

    const emmaDebug = createEmmaSyncDebug(this.log);
    return this.mutationLock.run(() =>
      settleEmmaFolioWithVcc(jar, baseUrl, {
        hotelId: hid,
        reservationId: params.reservationId,
        folioId: params.folioId,
        amount: params.amount,
        currency: params.currency,
        employee: operatorCode,
        sapClient,
        debug: emmaDebug.verbose ? emmaDebug : undefined,
      }),
    );
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
