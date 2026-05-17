import { Injectable, Logger } from '@nestjs/common';
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
@Injectable()
export class EmmaService {
  private readonly log = new Logger(EmmaService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
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

  async syncRoomStatuses(runOpts: { hotelId?: string } = {}): Promise<EmmaRoomStatusSyncResult> {
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
    const probe = await emmaHttpProbeOData(jar, baseUrl, sapClient);
    if (!probe.ok) {
      this.log.warn(`[EMMA] HTTP-Session abgelaufen (${probe.reason}) — erneuter Login`);
      await this.refreshHttpSession();
      jar = await this.loadEmmaHttpJar();
    }

    const updatedRoomIds: string[] = [];
    const snapshots = await fetchEmmaRoomStatusSnapshotsHttp(jar, baseUrl, hotelId, sapClient);
    this.log.log(`[EMMA] ${snapshots.length} Zimmer aus RoomDetail (${Date.now() - startedAt}ms)`);

    const result = await applyEmmaSnapshotsToRooms(
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

  private async buildLoginOpts(): Promise<EmmaLoginOpts> {
    const creds = await this.settings.getEmmaLoginSecrets();
    this.assertCredentialsComplete(creds);
    return {
      adfsEmail: creds.adfsEmail!,
      adfsPassword: creds.adfsPassword!,
      totpSecret: creds.totpSecret!,
      sapUser: creds.sapUser!,
      sapPassword: creds.sapPassword!,
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
