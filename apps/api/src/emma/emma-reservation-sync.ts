import { Logger } from '@nestjs/common';
import type { EmmaCookieJar } from './emma-cookie-jar';
import {
  emmaHttpFetchCsrfToken,
  emmaHttpPostBatch,
} from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  buildODataBatchBody,
  EMMA_DEFAULT_HOTEL_ID,
  EMMA_DEFAULT_SAP_CLIENT,
  EMMA_ODATA_HOTEL_SRV,
  EMMA_ODATA_RSRVS_SRV,
  hotelOverviewBatchPath,
  inHouseListBatchPath,
  parseODataBatchResponse,
  parseODataResultsJson,
  reservationListBatchPath,
  type ReservationListTab,
} from './emma-odata-client';
import type { SecretCipherService } from '../common/crypto/secret-cipher.service';
import {
  buildSensitivePayload,
  encryptSensitivePayload,
  parseEmmaDateOnly,
  todayIsoDate,
} from '../reservations/reservation-sensitive';

export type EmmaHotelOverview = {
  hotelId: string;
  checkInDone: number;
  checkInQueue: number;
  checkInPending: number;
  arrivals: number;
  checkOutDone: number;
  checkOutToday: number;
  inHouse: number;
  departures: number;
};

export type EmmaReservationSyncResult = {
  hotelId: string;
  syncedAt: string;
  tabs: Record<ReservationListTab, number>;
  inhouseList: number;
  totalRows: number;
  upserted: number;
  overview: EmmaHotelOverview | null;
};

const TAB_FILTER_LABEL: Record<ReservationListTab, string> = {
  arrivals: 'Arrivals',
  queue: 'CheckInQueue',
  inhouse: 'InHouse',
};

const log = new Logger('EmmaReservationSync');

export type ReservationUpsertRow = {
  hotelId: string;
  reservationId: string;
  arrivalDate: Date;
  departureDate: Date;
  roomId: string | null;
  checkIn: boolean;
  checkOut: boolean;
  checkInQueue: boolean;
  nightsStay: number | null;
  roomType: string | null;
  mealPlan: string | null;
  tier: string | null;
  numPax: number | null;
  sensitiveEnc: string;
  syncedAt: Date;
};

export async function fetchEmmaReservationsForTab(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  sapClient: string,
  tab: ReservationListTab,
  arrivalDateIso: string,
  csrfToken: string,
  debug?: EmmaSyncDebug,
): Promise<Record<string, unknown>[]> {
  const pageSize = tab === 'arrivals' ? 999 : 500;
  const all: Record<string, unknown>[] = [];

  for (let skip = 0; skip < 10_000; skip += pageSize) {
    const path = reservationListBatchPath(hotelId, sapClient, tab, arrivalDateIso, skip, pageSize);
    const { body, contentType } = buildODataBatchBody([{ path, checkInApp: true }], csrfToken);
    const raw = await emmaHttpPostBatch(
      jar,
      baseUrl,
      EMMA_ODATA_RSRVS_SRV,
      sapClient,
      csrfToken,
      body,
      contentType,
      {
        label: `reservations.${tab}`,
        debug,
        parts: [{ path, checkInApp: true }],
        tmsFioriApp: 'CheckIn',
        tmsFilterTab: TAB_FILTER_LABEL[tab],
      },
    );
    const parts = parseODataBatchResponse(raw);
    let pageRows = 0;
    for (const part of parts) {
      if (part.status >= 200 && part.status < 300) {
        const batch = parseODataResultsJson(part.body);
        all.push(...batch);
        pageRows += batch.length;
      } else if (part.status >= 400) {
        log.warn(
          `[Reservations] tab=${tab} skip=${skip} batch part HTTP ${part.status}: ${part.body.slice(0, 200)}`,
        );
      }
    }
    if (pageRows < pageSize) break;
  }

  return all;
}

/** EMMA Search Reservations In House list (status-based filter from HAR). */
export async function fetchEmmaInHouseList(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  sapClient: string,
  csrfToken: string,
  debug?: EmmaSyncDebug,
): Promise<Record<string, unknown>[]> {
  const pageSize = 500;
  const all: Record<string, unknown>[] = [];

  for (let skip = 0; skip < 10_000; skip += pageSize) {
    const path = inHouseListBatchPath(hotelId, sapClient, skip, pageSize);
    const { body, contentType } = buildODataBatchBody([{ path }], csrfToken);
    const raw = await emmaHttpPostBatch(
      jar,
      baseUrl,
      EMMA_ODATA_RSRVS_SRV,
      sapClient,
      csrfToken,
      body,
      contentType,
      {
        label: 'reservations.inhouse-list',
        debug,
        parts: [{ path }],
        tmsFioriApp: 'zey_tms_rs-display',
        tmsFilterTab: 'InHouse',
      },
    );
    const parts = parseODataBatchResponse(raw);
    let pageRows = 0;
    for (const part of parts) {
      if (part.status >= 200 && part.status < 300) {
        const batch = parseODataResultsJson(part.body);
        all.push(...batch);
        pageRows += batch.length;
      } else if (part.status >= 400) {
        log.warn(
          `[Reservations] inhouse-list skip=${skip} batch part HTTP ${part.status}: ${part.body.slice(0, 200)}`,
        );
      }
    }
    if (pageRows < pageSize) break;
  }

  return all;
}

export async function fetchEmmaHotelOverview(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  sapClient: string,
  csrfToken: string,
  debug?: EmmaSyncDebug,
): Promise<EmmaHotelOverview | null> {
  const path = hotelOverviewBatchPath(hotelId, sapClient);
  const { body, contentType } = buildODataBatchBody([{ path, checkInApp: true }], csrfToken);
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_HOTEL_SRV,
    sapClient,
    csrfToken,
    body,
    contentType,
    {
      label: 'reservations.hotelOverview',
      debug,
      parts: [{ path, checkInApp: true }],
      tmsFioriApp: 'CheckIn',
    },
  );
  const parts = parseODataBatchResponse(raw);
  for (const part of parts) {
    if (part.status < 200 || part.status >= 300) continue;
    try {
      const parsed = JSON.parse(part.body) as { d?: Record<string, unknown> };
      const d = parsed.d;
      if (!d) continue;
      const num = (k: string) => parseInt(String(d[k] ?? '0'), 10) || 0;
      return {
        hotelId,
        checkInDone: num('CheckInDone'),
        checkInQueue: num('CheckInQueue'),
        checkInPending: num('CheckInPending'),
        arrivals: num('Arrivals'),
        checkOutDone: num('CheckOutDone'),
        checkOutToday: num('CheckOutToday'),
        inHouse: num('InHouse'),
        departures: num('Departures'),
      };
    } catch {
      /* next part */
    }
  }
  return null;
}

export function mapEmmaReservationRowToUpsert(
  row: Record<string, unknown>,
  cipher: SecretCipherService,
  syncedAt: Date,
): ReservationUpsertRow | null {
  const hotelId = String(row.HotelId ?? '').trim();
  const reservationId = String(row.ReservationId ?? '').trim();
  if (!hotelId || !reservationId) return null;

  const arrivalDate = parseEmmaDateOnly(row.ArrivalDate);
  const departureDate = parseEmmaDateOnly(row.DepartureDate);
  if (!arrivalDate || !departureDate) return null;

  const numPax1 = row.NumPax1;
  let numPax: number | null = null;
  if (typeof numPax1 === 'number') numPax = numPax1;
  else if (numPax1 != null) {
    const n = parseInt(String(numPax1), 10);
    if (Number.isFinite(n)) numPax = n;
  }

  const roomRaw = row.RoomId;
  const roomId =
    roomRaw != null && String(roomRaw).trim() !== '' ? String(roomRaw).trim() : null;

  const sensitive = buildSensitivePayload(row, log);

  return {
    hotelId,
    reservationId,
    arrivalDate,
    departureDate,
    roomId,
    checkIn: row.CheckIn === true,
    checkOut: row.CheckOut === true,
    checkInQueue: row.CheckInQueue === true,
    nightsStay:
      typeof row.NightsStay === 'number'
        ? row.NightsStay
        : parseInt(String(row.NightsStay ?? ''), 10) || null,
    roomType: row.RoomType != null ? String(row.RoomType) : null,
    mealPlan: row.MealPlan != null ? String(row.MealPlan) : null,
    tier: row.Tier != null ? String(row.Tier) : null,
    numPax,
    sensitiveEnc: encryptSensitivePayload(cipher, sensitive),
    syncedAt,
  };
}

export async function syncEmmaReservationsFromJar(
  jar: EmmaCookieJar,
  baseUrl: string,
  cipher: SecretCipherService,
  opts: {
    hotelId?: string;
    sapClient?: string;
    arrivalDateIso?: string;
    debug?: EmmaSyncDebug;
  } = {},
): Promise<{
  rows: ReservationUpsertRow[];
  arrivalsReservationIds: string[];
  result: EmmaReservationSyncResult;
}> {
  const hotelId = opts.hotelId?.trim() || EMMA_DEFAULT_HOTEL_ID;
  const sapClient = opts.sapClient?.trim() || EMMA_DEFAULT_SAP_CLIENT;
  const arrivalDateIso = opts.arrivalDateIso ?? todayIsoDate();
  const syncedAt = new Date();

  const csrfRsrvs = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
  const csrfHotel = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_HOTEL_SRV);

  const tabs: ReservationListTab[] = ['arrivals', 'queue', 'inhouse'];
  const tabCounts: Record<ReservationListTab, number> = {
    arrivals: 0,
    queue: 0,
    inhouse: 0,
  };
  const merged = new Map<string, Record<string, unknown>>();
  const arrivalsReservationIds: string[] = [];

  for (const tab of tabs) {
    const fetched = await fetchEmmaReservationsForTab(
      jar,
      baseUrl,
      hotelId,
      sapClient,
      tab,
      arrivalDateIso,
      csrfRsrvs,
      opts.debug,
    );
    tabCounts[tab] = fetched.length;
    for (const row of fetched) {
      const id = String(row.ReservationId ?? '');
      if (!id) continue;
      if (tab === 'arrivals') arrivalsReservationIds.push(id);
      const prev = merged.get(id);
      merged.set(id, prev ? { ...prev, ...row } : row);
    }
  }

  const inHouseRows = await fetchEmmaInHouseList(
    jar,
    baseUrl,
    hotelId,
    sapClient,
    csrfRsrvs,
    opts.debug,
  );
  for (const row of inHouseRows) {
    const id = String(row.ReservationId ?? '');
    if (!id) continue;
    const prev = merged.get(id);
    merged.set(id, prev ? { ...prev, ...row } : row);
  }

  const overview = await fetchEmmaHotelOverview(
    jar,
    baseUrl,
    hotelId,
    sapClient,
    csrfHotel,
    opts.debug,
  );

  const rows: ReservationUpsertRow[] = [];
  for (const row of merged.values()) {
    const mapped = mapEmmaReservationRowToUpsert(row, cipher, syncedAt);
    if (mapped) rows.push(mapped);
  }

  const result: EmmaReservationSyncResult = {
    hotelId,
    syncedAt: syncedAt.toISOString(),
    tabs: tabCounts,
    inhouseList: inHouseRows.length,
    totalRows: merged.size,
    upserted: rows.length,
    overview,
  };

  log.log(
    `[Reservations] fetched arrivals=${tabCounts.arrivals} queue=${tabCounts.queue} inhouse=${tabCounts.inhouse} inhouseList=${inHouseRows.length} unique=${merged.size}`,
  );

  return { rows, arrivalsReservationIds, result };
}

export async function applyReservationUpserts(
  upsert: (row: ReservationUpsertRow) => Promise<void>,
  rows: ReservationUpsertRow[],
): Promise<number> {
  let n = 0;
  for (const row of rows) {
    await upsert(row);
    n++;
  }
  return n;
}
