import { Injectable, Logger } from '@nestjs/common';

/**
 * One normalised shift as returned by the Favur scraper.
 * `favurUserId` is whatever stable identifier Favur uses (employee number,
 * uuid, etc.). `favurDisplayName` is what we show in the UI until the admin
 * maps the Favur user to a local User account.
 */
export type FavurShift = {
  favurUserId: string;
  favurDisplayName: string;
  startsAt: Date;
  endsAt: Date;
  /** Optional Favur shift code/label like "FD", "MD", location, role. */
  label?: string | null;
  /** Stable per-shift id from Favur so we can upsert without duplicates. */
  sourceId: string;
};

export type FavurCredentials = {
  email: string;
  password: string;
  baseUrl: string;
};

export type FavurFetchOptions = {
  /** Inclusive start (typically today, midnight Europe/Zurich). */
  from: Date;
  /** Exclusive end. */
  to: Date;
};

/**
 * Calibrated Favur scraper.
 *
 * NOTE — calibration required:
 *   This scraper currently throws a clear error until we have the actual
 *   request shape from web.favur.ch. To finish the wiring we need:
 *     1. The login request (URL, method, body, response token format).
 *     2. The shifts/team-roster request (URL with date params, headers).
 *     3. The response shape (where in the JSON `userId`, `name`, `start`,
 *        `end` and a stable shift id live).
 *
 *   Once we have those (paste them in via the admin "Integrations" page
 *   or share the cURL with the developer) the three TODOs below get
 *   implemented and the rest of the pipeline (DB, cron, UI) keeps working
 *   unchanged.
 */
@Injectable()
export class FavurScraperService {
  private readonly logger = new Logger(FavurScraperService.name);

  async fetchShifts(
    creds: FavurCredentials,
    opts: FavurFetchOptions,
  ): Promise<FavurShift[]> {
    this.logger.log(
      `Favur fetch requested for ${opts.from.toISOString()} → ${opts.to.toISOString()} (${creds.baseUrl})`,
    );
    // TODO(calibration): implement once we have the actual login + shifts
    // request format from web.favur.ch (see class docblock).
    throw new Error(
      'Favur scraper is not yet calibrated. Open the admin "Integrations → Favur" page to record the request format, or contact your developer with the login + shifts cURL from web.favur.ch.',
    );
  }
}
