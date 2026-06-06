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
  reservationDetailBatchPaths,
} from './emma-odata-client';
import type { SecretCipherService } from '../common/crypto/secret-cipher.service';
import {
  buildReservationDetailBundle,
  type ReservationEmmaDetailBundle,
} from '../reservations/reservation-detail-bundle';
import { mapEmmaReservationRowToUpsert, type ReservationUpsertRow } from './emma-reservation-sync';

const log = new Logger('EmmaReservationDetail');

export type EmmaReservationDetailFetchResult = {
  hotelId: string;
  reservationId: string;
  upsert: ReservationUpsertRow;
  bundle: ReservationEmmaDetailBundle;
};

export async function fetchEmmaReservationDetailFromJar(
  jar: EmmaCookieJar,
  baseUrl: string,
  cipher: SecretCipherService,
  opts: {
    hotelId?: string;
    reservationId: string;
    sapClient?: string;
    debug?: EmmaSyncDebug;
  },
): Promise<EmmaReservationDetailFetchResult> {
  const hotelId = opts.hotelId?.trim() || EMMA_DEFAULT_HOTEL_ID;
  const reservationId = opts.reservationId.trim();
  const sapClient = opts.sapClient?.trim() || EMMA_DEFAULT_SAP_CLIENT;
  if (!reservationId) throw new Error('ReservationId required');

  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
  const parts = reservationDetailBatchPaths(hotelId, reservationId, sapClient);
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
      label: `reservation.detail.${reservationId}`,
      debug: opts.debug,
      parts,
      tmsFioriApp: 'CheckIn',
    },
  );

  const batchParts = parseODataBatchResponse(raw);
  if (batchParts.length < parts.length) {
    log.warn(
      `[Reservations] detail batch expected ${parts.length} parts, got ${batchParts.length} for ${reservationId}`,
    );
  }

  const readPart = (index: number, label: string): string => {
    const part = batchParts[index];
    if (!part || part.status < 200 || part.status >= 300) {
      const status = part?.status ?? 'missing';
      const snippet = part?.body?.slice(0, 200) ?? '';
      throw new Error(
        `EMMA reservation detail ${label} failed (HTTP ${status}) for ${reservationId}: ${snippet}`,
      );
    }
    return part.body;
  };

  const reservation =
    parseODataEntityJson(readPart(0, 'main')) ??
    (() => {
      throw new Error(`EMMA reservation main entity empty for ${reservationId}`);
    })();

  const guests = parseODataResultsJson(readPart(1, 'guests'));
  const creditCards = parseODataResultsJson(readPart(2, 'creditCards'));
  const preauthorizations = parseODataResultsJson(readPart(3, 'preauthorizations'));
  const roomList = parseODataResultsJson(readPart(4, 'roomList'));
  const loyaltyBenefits = parseODataResultsJson(readPart(5, 'loyaltyBenefits'));
  const policeRecords = parseODataResultsJson(readPart(6, 'policeRecords'));

  const fetchedAt = new Date();
  const bundle = buildReservationDetailBundle({
    reservation,
    guests,
    creditCards,
    preauthorizations,
    roomList,
    loyaltyBenefits,
    policeRecords,
    fetchedAt,
  });

  const upsert = mapEmmaReservationRowToUpsert(reservation, cipher, fetchedAt);
  if (!upsert) {
    throw new Error(`EMMA reservation ${reservationId} could not be mapped to snapshot`);
  }

  log.log(
    `[Reservations] fetched detail ${reservationId}: guests=${guests.length} cards=${creditCards.length} rooms=${roomList.length}`,
  );

  return { hotelId, reservationId, upsert, bundle };
}
