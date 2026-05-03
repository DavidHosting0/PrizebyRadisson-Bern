import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  SettingsService,
  type EmmaLoginStored,
} from '../settings/settings.service';
import {
  runEmmaSearchReservationAndOpenFolio,
  type EmmaOpenFolioProgressEvent,
} from './emma-reservation-folio-open';
import { emmaLaunchpadUrl, type EmmaLoginOpts } from './emma-scraper';
import { EmmaBrowserSessionService } from './emma-session.service';

export type EmmaLoginTestResult = {
  ok: true;
  url: string;
  title: string;
  durationMs: number;
};

export type EmmaOpenReservationFolioResult = {
  ok: true;
  url: string;
  title: string;
  durationMs: number;
};

export type { EmmaOpenFolioProgressEvent } from './emma-reservation-folio-open';

/**
 * High-level entry point for EMMA work. Today this is just a `testLogin`
 * helper; future actions (room status, reservations, check-in/out, etc.)
 * should land in this service so callers don't need to know about Playwright
 * directly.
 */
@Injectable()
export class EmmaService {
  private readonly log = new Logger(EmmaService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly session: EmmaBrowserSessionService,
  ) {}

  /** Read EMMA credential metadata for the admin UI (no plaintext secrets). */
  getLoginMeta() {
    return this.settings.getEmmaLoginMeta();
  }

  /**
   * Drive a real Chromium login through all four EMMA stages and return basic
   * info about the page we landed on. Throws if any stage fails.
   *
   * Pass `{ headless: false }` only from a local/dev workstation — production
   * (PM2 on a headless server) must always run headless.
   */
  async testLogin(runOpts: { headless?: boolean } = {}): Promise<EmmaLoginTestResult> {
    const opts = await this.buildLoginOpts();
    const startedAt = Date.now();

    this.log.log('[EMMA] testLogin gestartet');
    const result = await this.session.run(
      opts,
      async ({ page, gotoLoggedIn }) => {
        await gotoLoggedIn(emmaLaunchpadUrl(opts));
        await page
          .waitForLoadState('networkidle', { timeout: 30_000 })
          .catch(() => undefined);
        return {
          url: page.url(),
          title: await page.title().catch(() => ''),
        };
      },
      { headless: runOpts.headless ?? true },
    );
    const durationMs = Date.now() - startedAt;
    this.log.log(`[EMMA] testLogin erfolgreich (${durationMs}ms): ${result.url}`);
    return { ok: true, durationMs, ...result };
  }

  /**
   * Force the next EMMA action to do a fresh end-to-end login (drops the
   * persistent Chromium browser context and its cookies).
   */
  async invalidateSession() {
    await this.session.invalidateSession();
    return { ok: true };
  }

  /**
   * Log in (reusing session when possible), run **Search Reservations** with the
   * shell box + date filters, open the PMS row by double-clicking the reservation
   * column cell, then open **Folio Management** for that stay.
   *
   * @param onStep optional live progress (e.g. NDJSON stream to the PrizeBern UI).
   */
  async openReservationFolio(
    body: {
      shellSearch: string;
      gridReservationId: string;
      checkInDate?: string | null;
      checkOutDate?: string | null;
      headless?: boolean;
    },
    onStep?: (event: EmmaOpenFolioProgressEvent) => void,
  ): Promise<EmmaOpenReservationFolioResult> {
    const shellSearch = body.shellSearch?.trim();
    const gridReservationId = body.gridReservationId?.trim();
    if (!shellSearch || !gridReservationId) {
      throw new BadRequestException(
        'shellSearch and gridReservationId are required.',
      );
    }

    const emit = (event: EmmaOpenFolioProgressEvent) => {
      onStep?.(event);
    };

    const opts = await this.buildLoginOpts((msg) =>
      emit({ step: 'session_login', message: msg }),
    );
    const startedAt = Date.now();
    this.log.log('[EMMA] openReservationFolio gestartet');

    const result = await this.session.run(
      opts,
      async ({ page, gotoLoggedIn }) => {
        emit({
          step: 'session_launch',
          message: 'Launchpad laden (Session / Login) …',
        });
        await gotoLoggedIn(emmaLaunchpadUrl(opts));
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
        emit({ step: 'session_ready', message: 'Launchpad bereit.' });
        return runEmmaSearchReservationAndOpenFolio(
          page,
          {
            shellSearch,
            gridReservationId,
            checkInDate: body.checkInDate,
            checkOutDate: body.checkOutDate,
          },
          onStep,
        );
      },
      { headless: body.headless ?? true },
    );

    const durationMs = Date.now() - startedAt;
    this.log.log(`[EMMA] openReservationFolio OK (${durationMs}ms): ${result.url}`);
    return { ok: true, durationMs, ...result };
  }

  /**
   * Build {@link EmmaLoginOpts} from `HotelSettings.settings.emmaLogin`
   * (Admin UI: Stufe 1 ADFS, 2 TOTP, 3 SAP, 4 Property, optional Launchpad-URL).
   * Used for every Playwright run; {@link emmaLogin} consumes this object as-is.
   * Throws if stages 1–3 required fields are missing.
   */
  private async buildLoginOpts(
    onSessionLog?: (message: string) => void,
  ): Promise<EmmaLoginOpts> {
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
      progress: (msg) => {
        this.log.log(msg);
        onSessionLog?.(msg);
      },
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
