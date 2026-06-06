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
  EMMA_FIORI_APP_RESERVATIONS,
  hotelOverviewBatchPath,
  INHOUSE_STATUS_CODES,
  inHouseCheckInFallbackBatchPath,
  inHouseListBatchPath,
  inHouseStatusListBatchPath,
  parseODataBatchResponse,
  parseODataResultsJson,
  reservationListBatchPath,
  type ReservationListTab,
} from './emma-odata-client';
import { normalizeEmmaRoomNumber } from './emma-room-status-sync';
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

function isEmmaTruthyFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'x' || s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

/** EMMA Status may arrive as 9, "9", or "09". */
export function normalizeEmmaReservationStatus(status: unknown): string | null {
  if (status == null || status === '') return null;
  const raw = String(status).trim();
  if (/^\d+$/.test(raw)) return String(parseInt(raw, 10)).padStart(2, '0');
  return raw;
}

function isInHouseEmmaStatus(status: unknown): boolean {
  const norm = normalizeEmmaReservationStatus(status);
  if (!norm) return false;
  return (INHOUSE_STATUS_CODES as readonly string[]).includes(norm);
}

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

/** EMMA Search Reservations In House list (openinhouse.com.har). */
async function fetchEmmaInHouseListPages(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrfToken: string,
  pathForPage: (skip: number, top: number) => string,
  label: string,
  debug?: EmmaSyncDebug,
): Promise<Record<string, unknown>[]> {
  const pageSize = 500;
  const all: Record<string, unknown>[] = [];
  const partSpec = {
    tmsFioriApp: EMMA_FIORI_APP_RESERVATIONS,
    tmsFilterTab: 'InHouse',
  };

  for (let skip = 0; skip < 10_000; skip += pageSize) {
    const path = pathForPage(skip, pageSize);
    const { body, contentType } = buildODataBatchBody([{ path, ...partSpec }], csrfToken);
    const raw = await emmaHttpPostBatch(
      jar,
      baseUrl,
      EMMA_ODATA_RSRVS_SRV,
      sapClient,
      csrfToken,
      body,
      contentType,
      {
        label,
        debug,
        parts: [{ path, ...partSpec }],
        tmsFioriApp: EMMA_FIORI_APP_RESERVATIONS,
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
          `[Reservations] ${label} skip=${skip} batch part HTTP ${part.status}: ${part.body.slice(0, 200)}`,
        );
      }
    }
    if (pageRows < pageSize) break;
  }

  return all;
}

export async function fetchEmmaInHouseList(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  sapClient: string,
  csrfToken: string,
  debug?: EmmaSyncDebug,
): Promise<Record<string, unknown>[]> {
  const primary = await fetchEmmaInHouseListPages(
    jar,
    baseUrl,
    sapClient,
    csrfToken,
    (skip, top) => inHouseListBatchPath(hotelId, sapClient, skip, top),
    'reservations.inhouse-list',
    debug,
  );
  if (primary.length > 0) return primary;

  log.warn('[Reservations] inhouse-list HAR tab returned 0 rows — trying status filter');
  const byStatus = await fetchEmmaInHouseListPages(
    jar,
    baseUrl,
    sapClient,
    csrfToken,
    (skip, top) => inHouseStatusListBatchPath(hotelId, sapClient, skip, top),
    'reservations.inhouse-list.status',
    debug,
  );
  if (byStatus.length > 0) return byStatus;

  log.warn('[Reservations] inhouse-list status filter returned 0 rows — trying CheckIn fallback');
  return fetchEmmaInHouseListPages(
    jar,
    baseUrl,
    sapClient,
    csrfToken,
    (skip, top) => inHouseCheckInFallbackBatchPath(hotelId, sapClient, skip, top),
    'reservations.inhouse-list.fallback',
    debug,
  );
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
  inHouseSourceIds: ReadonlySet<string> = new Set(),
): ReservationUpsertRow | null {
  const hotelId = String(row.HotelId ?? '').trim();
  const reservationId = String(row.ReservationId ?? '').trim();
  if (!hotelId || !reservationId) return null;

  const arrivalDate = parseEmmaDateOnly(row.ArrivalDate);
  const departureDate = parseEmmaDateOnly(row.DepartureDate);
  if (!arrivalDate || !departureDate) return null;

  const numPax1 = row.NumPax1 ?? row.TotalPax;
  let numPax: number | null = null;
  if (typeof numPax1 === 'number') numPax = numPax1;
  else if (numPax1 != null) {
    const n = parseInt(String(numPax1), 10);
    if (Number.isFinite(n)) numPax = n;
  }

  const roomRaw = row.RoomId;
  const roomId =
    roomRaw != null && String(roomRaw).trim() !== ''
      ? normalizeEmmaRoomNumber(String(roomRaw).trim())
      : null;

  const fromInHouseSource = inHouseSourceIds.has(reservationId);

  const sensitive = buildSensitivePayload(row, log);

  return {
    hotelId,
    reservationId,
    arrivalDate,
    departureDate,
    roomId,
    checkIn: isEmmaTruthyFlag(row.CheckIn) || isInHouseEmmaStatus(row.Status) || fromInHouseSource,
    checkOut: isEmmaTruthyFlag(row.CheckOut),
    checkInQueue: isEmmaTruthyFlag(row.CheckInQueue),
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
  const inHouseSourceIds = new Set<string>();

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
      const id = String(row.ReservationId ?? '').trim();
      if (!id) continue;
      if (tab === 'arrivals') arrivalsReservationIds.push(id);
      if (tab === 'inhouse') inHouseSourceIds.add(id);
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
    const id = String(row.ReservationId ?? '').trim();
    if (!id) continue;
    inHouseSourceIds.add(id);
    const prev = merged.get(id);
    // Rows from the Search-Reservations In House list are in-house by definition.
    merged.set(id, prev ? { ...prev, ...row, CheckIn: true } : { ...row, CheckIn: true });
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
  let skipped = 0;
  for (const row of merged.values()) {
    const mapped = mapEmmaReservationRowToUpsert(row, cipher, syncedAt, inHouseSourceIds);
    if (mapped) rows.push(mapped);
    else skipped++;
  }
  if (skipped > 0) {
    log.warn(
      `[Reservations] skipped ${skipped}/${merged.size} merged rows (missing HotelId, ReservationId, or dates)`,
    );
  }

  const inHouseUpserted = rows.filter((r) => r.checkIn && !r.checkOut).length;
  log.log(
    `[Reservations] in-house sources=${inHouseSourceIds.size} upserted in-house=${inHouseUpserted}`,
  );

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
