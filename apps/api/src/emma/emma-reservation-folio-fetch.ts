import { Logger } from '@nestjs/common';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  buildODataBatchBody,
  EMMA_DEFAULT_HOTEL_ID,
  EMMA_DEFAULT_SAP_CLIENT,
  EMMA_ODATA_RSRVS_SRV,
  parseODataBatchResponse,
  parseODataEntityJson,
  parseODataResultsJson,
  reservationFolioBatchPaths,
} from './emma-odata-client';
import type { SecretCipherService } from '../common/crypto/secret-cipher.service';
import {
  buildReservationFolioBundle,
  type ReservationEmmaFolioBundle,
} from '../reservations/reservation-folio-bundle';
import { mapEmmaReservationRowToUpsert, type ReservationUpsertRow } from './emma-reservation-sync';

const log = new Logger('EmmaReservationFolio');

export type EmmaReservationFolioFetchResult = {
  hotelId: string;
  reservationId: string;
  upsert: ReservationUpsertRow | null;
  bundle: ReservationEmmaFolioBundle;
};

export async function fetchEmmaReservationFolioFromJar(
  jar: EmmaCookieJar,
  baseUrl: string,
  cipher: SecretCipherService,
  opts: {
    hotelId?: string;
    reservationId: string;
    sapClient?: string;
    debug?: EmmaSyncDebug;
  },
): Promise<EmmaReservationFolioFetchResult> {
  const hotelId = opts.hotelId?.trim() || EMMA_DEFAULT_HOTEL_ID;
  const reservationId = opts.reservationId.trim();
  const sapClient = opts.sapClient?.trim() || EMMA_DEFAULT_SAP_CLIENT;
  if (!reservationId) throw new Error('ReservationId required');

  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
  const parts = reservationFolioBatchPaths(hotelId, reservationId, sapClient);
  const { body, contentType } = buildODataBatchBody(parts, csrf);
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrf,
    body,
    contentType,
    {
      label: `reservation.folio.${reservationId}`,
      debug: opts.debug,
      parts,
    },
  );

  const batchParts = parseODataBatchResponse(raw);
  const readPart = (index: number, label: string): string => {
    const part = batchParts[index];
    if (!part || part.status < 200 || part.status >= 300) {
      const status = part?.status ?? 'missing';
      const snippet = part?.body?.slice(0, 200) ?? '';
      throw new Error(
        `EMMA folio ${label} failed (HTTP ${status}) for ${reservationId}: ${snippet}`,
      );
    }
    return part.body;
  };

  const reservation =
    parseODataEntityJson(readPart(0, 'expand')) ??
    (() => {
      throw new Error(`EMMA folio reservation empty for ${reservationId}`);
    })();

  const remarks = parseODataEntityJson(readPart(1, 'remarks'));
  const depositConcepts = parseODataResultsJson(readPart(2, 'depositConcepts'));

  const fetchedAt = new Date();
  const bundle = buildReservationFolioBundle({
    reservation,
    remarks,
    depositConcepts,
    fetchedAt,
  });

  const upsert = mapEmmaReservationRowToUpsert(reservation, cipher, fetchedAt);

  log.log(
    `[Reservations] fetched folio ${reservationId}: folios=${bundle.folios.length} charges=${bundle.charges.length} byFolio=${JSON.stringify(
      Object.fromEntries(
        Object.entries(bundle.chargesByFolio ?? {}).map(([k, v]) => [k, v.length]),
      ),
    )}`,
  );

  return { hotelId, reservationId, upsert, bundle };
}
