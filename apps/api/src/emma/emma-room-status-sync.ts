import { DerivedRoomStatus } from '@housekeeping/shared';
import type { EmmaCookieJar } from './emma-cookie-jar';
import {
  emmaHttpFetchCsrfToken,
  emmaHttpPostBatch,
} from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  logParsedSnapshots,
  logRawRowSample,
} from './emma-sync-debug';
import type { ODataBatchPartSpec } from './emma-odata-client';
import {
  buildODataBatchBody,
  EMMA_DEFAULT_BUILDING_ID,
  EMMA_DEFAULT_HOTEL_ID,
  EMMA_DEFAULT_SAP_CLIENT,
  EMMA_ODATA_RSRVS_SRV,
  parseODataBatchResponse,
  parseODataCount,
  parseODataResultsJson,
  buildingsFloorsCountBatchPath,
  buildingsFloorsListBatchPath,
  floorRoomDetailsCountBatchPath,
  floorRoomDetailsBatchPath,
  roomDetailBatchPath,
  roomDetailCountBatchPath,
  roomsWithRackDaysBatchPath,
  roomsWithRackDaysCountBatchPath,
  roomStatusCountBatchPath,
  roomStatusListBatchPath,
} from './emma-odata-client';
import { parseEmmaDateOnly, todayIsoDate } from '../reservations/reservation-sensitive';

/** Normalized EMMA row for one physical room. */
export type EmmaRoomStatusSnapshot = {
  emmaRoomId: string;
  roomNumber: string;
  statusCode: string | null;
  statusLabel: string | null;
  outOfOrder: boolean;
  floorId: string | null;
  buildingId: string | null;
  raw: Record<string, unknown>;
};

export type EmmaRoomStatusSyncResult = {
  hotelId: string;
  syncedAt: string;
  emmaRooms: number;
  matched: number;
  updated: number;
  unmatchedEmma: string[];
  unmatchedLocal: string[];
};

function pickField(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  const v = pickField(row, keys);
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** EMMA uses 4-digit room ids (0021); PrizeBern uses 21, 101, … */
export function normalizeEmmaRoomNumber(emmaRoomId: string): string {
  const trimmed = emmaRoomId.trim();
  const n = parseInt(trimmed, 10);
  if (Number.isFinite(n) && n > 0) return String(n);
  return trimmed.replace(/^0+/, '') || trimmed;
}

function isTruthyFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'x' || s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

export function extractExpandedResults(
  row: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const nav = row[key];
  if (!nav || typeof nav !== 'object' || Array.isArray(nav)) return [];
  const results = (nav as { results?: unknown[] }).results;
  if (!Array.isArray(results)) return [];
  return results.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object');
}

export function isOoRackStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toUpperCase();
  return s === 'OO' || s === 'OOO' || s === 'OOS' || /^O(OO|OS)?$/.test(s);
}

function dateOnlyToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** True when a rack-day incident covers the given hotel calendar day (YYYY-MM-DD). */
export function isRackDayActiveOnDate(
  rackDay: Record<string, unknown>,
  todayIso: string,
): boolean {
  const arrival = parseEmmaDateOnly(pickField(rackDay, ['ArrivalDate']));
  const departure = parseEmmaDateOnly(pickField(rackDay, ['DepartureDate']));
  if (arrival && departure) {
    const from = dateOnlyToIso(arrival);
    const to = dateOnlyToIso(departure);
    return todayIso >= from && todayIso <= to;
  }
  const day = pickString(rackDay, ['Day']);
  if (day?.length === 8) {
    const dayIso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
    return dayIso === todayIso;
  }
  return false;
}

export function roomHasActiveOutOfOrderRackDay(
  roomRow: Record<string, unknown>,
  todayIso = todayIsoDate(),
): boolean {
  for (const rackDay of extractExpandedResults(roomRow, 'RoomRackDays')) {
    const status = pickString(rackDay, ['Status', 'RoomStatus', 'RackStatus']);
    if (isOoRackStatus(status) && isRackDayActiveOnDate(rackDay, todayIso)) return true;
  }
  return false;
}

function detectOutOfOrder(row: Record<string, unknown>, statusCode: string | null): boolean {
  if (
    isTruthyFlag(pickField(row, ['OutOfOrder', 'Ooo', 'IsOutOfOrder', 'RoomOutOfOrder', 'OutOfService']))
  ) {
    return true;
  }
  if (roomHasActiveOutOfOrderRackDay(row)) return true;
  const text = [
    pickString(row, ['StatusText', 'RoomStatusText', 'HkStatusText', 'Description']),
    pickString(row, ['Remark', 'Comments']),
  ]
    .filter(Boolean)
    .join(' ');
  if (/out\s*of\s*order|ooo|außer\s*betrieb/i.test(text)) return true;
  if (statusCode && /^O(OO|OS)?$/i.test(statusCode)) return true;
  return false;
}

function extractStatusCode(row: Record<string, unknown>): string | null {
  /** Room Status UI uses `RoomStatus` (e.g. IN, DI) on RoomDetail rows. */
  const raw = pickString(row, [
    'RoomStatus',
    'HkStatus',
    'HKStatus',
    'HousekeepingStatus',
    'FoStatus',
    'Status',
    'RoomStat',
    'HkRoomStatus',
  ]);
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (compact.length <= 4) return compact;
  return compact.slice(0, 4);
}

export function mapEmmaRoomDetailRow(
  row: Record<string, unknown>,
  statusLookup: Map<string, string>,
): EmmaRoomStatusSnapshot | null {
  const emmaRoomId =
    pickString(row, ['RoomId', 'RoomID', 'RoomNumber', 'RoomNo', 'Room']) ?? null;
  if (!emmaRoomId) return null;

  const roomNumber = normalizeEmmaRoomNumber(emmaRoomId);
  const statusCode = extractStatusCode(row);
  const statusLabel =
    pickString(row, ['HkStatusText', 'RoomStatusText', 'StatusText', 'StatusDescription']) ??
    (statusCode ? statusLookup.get(statusCode) ?? null : null);

  return {
    emmaRoomId,
    roomNumber,
    statusCode,
    statusLabel,
    outOfOrder: detectOutOfOrder(row, statusCode),
    floorId: pickString(row, ['FloorId', 'Floor', 'FloorID']),
    buildingId: pickString(row, ['BuildingId', 'Building']),
    raw: row,
  };
}

function buildStatusLookup(rows: Record<string, unknown>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of rows) {
    const code = pickString(row, ['RoomStatus', 'Status', 'HkStatus', 'Code', 'StatusCode']);
    const label = pickString(row, ['Description', 'StatusText', 'Text', 'Name']);
    if (code && label) m.set(code.toUpperCase(), label);
  }
  return m;
}

async function postEmmaBatch(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrfToken: string,
  label: string,
  parts: ODataBatchPartSpec[],
  debug?: EmmaSyncDebug,
): Promise<string> {
  const { body, contentType } = buildODataBatchBody(parts, csrfToken);
  return emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrfToken,
    body,
    contentType,
    { label, debug, parts },
  );
}

function pickFloorIds(rows: Record<string, unknown>[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    const id = pickString(row, ['FloorId', 'Floor', 'FloorID']);
    if (id) ids.push(id);
  }
  return ids;
}

/** Per-floor RoomDetails batches (same paths as EMMA Room Status UI). */
async function fetchRoomDetailsViaFloorsHttp(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  buildingId: string,
  sapClient: string,
  csrfToken: string,
  pageSize = 999,
  debug?: EmmaSyncDebug,
): Promise<Record<string, unknown>[]> {
  debug?.log(`[EMMA debug] fetch via Floors/RoomDetails hotel=${hotelId} building=${buildingId}`);
  const floorsParts: ODataBatchPartSpec[] = [
    {
      path: buildingsFloorsCountBatchPath(hotelId, buildingId, sapClient),
      accept: 'plain',
    },
    {
      path: buildingsFloorsListBatchPath(hotelId, buildingId, sapClient, 0, pageSize),
    },
  ];
  const floorsText = await postEmmaBatch(
    jar,
    baseUrl,
    sapClient,
    csrfToken,
    'floors.list',
    floorsParts,
    debug,
  );
  const floorParts = parseODataBatchResponse(floorsText);
  const floorRows = parseODataResultsJson(floorParts[1]?.body ?? '');
  logRawRowSample(debug, 'floors', floorRows);
  const floorIds = pickFloorIds(floorRows);
  debug?.log(`[EMMA debug] floors erkannt: [${floorIds.join(', ')}] (${floorIds.length})`);
  if (!floorIds.length) return [];

  const all: Record<string, unknown>[] = [];
  const partsPerBatch = 10;
  for (let i = 0; i < floorIds.length; i += partsPerBatch) {
    const chunk = floorIds.slice(i, i + partsPerBatch);
    const batchParts = chunk.flatMap((floorId) => [
      {
        path: floorRoomDetailsCountBatchPath(hotelId, buildingId, floorId, sapClient),
        accept: 'plain' as const,
      },
      {
        path: floorRoomDetailsBatchPath(hotelId, buildingId, floorId, sapClient, 0, pageSize),
      },
    ]);
    const batchText = await postEmmaBatch(
      jar,
      baseUrl,
      sapClient,
      csrfToken,
      `floor.roomDetails.${i / partsPerBatch}`,
      batchParts,
      debug,
    );
    const responses = parseODataBatchResponse(batchText);
    for (let j = 0; j < chunk.length; j++) {
      const countPart = responses[j * 2];
      const dataPart = responses[j * 2 + 1];
      const floorId = chunk[j];
      if (countPart?.status && countPart.status >= 400) {
        debug?.warn(
          `[EMMA debug] floor ${floorId} $count HTTP ${countPart.status} body=${countPart.body.slice(0, 120)}`,
        );
      }
      if (dataPart?.status && dataPart.status >= 400) {
        debug?.warn(
          `[EMMA debug] floor ${floorId} RoomDetails HTTP ${dataPart.status} body=${dataPart.body.slice(0, 120)}`,
        );
        continue;
      }
      const rows = parseODataResultsJson(dataPart?.body ?? '');
      debug?.log(`[EMMA debug] floor ${floorId}: ${rows.length} RoomDetail-Zeilen`);
      logRawRowSample(debug, `floor.${floorId}`, rows);
      all.push(...rows);
    }
  }
  return all;
}

async function fetchAllRoomDetailRowsHttp(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  sapClient: string,
  csrfToken: string,
  pageSize = 999,
  debug?: EmmaSyncDebug,
): Promise<Record<string, unknown>[]> {
  try {
    const viaFloors = await fetchRoomDetailsViaFloorsHttp(
      jar,
      baseUrl,
      hotelId,
      EMMA_DEFAULT_BUILDING_ID,
      sapClient,
      csrfToken,
      pageSize,
      debug,
    );
    if (viaFloors.length > 0) {
      debug?.log(`[EMMA debug] Floors/RoomDetails: ${viaFloors.length} Zeilen gesamt`);
      return viaFloors;
    }
    debug?.warn('[EMMA debug] Floors/RoomDetails lieferte 0 Zeilen — Fallback RoomDetail');
  } catch (err) {
    debug?.warn(
      `[EMMA debug] Floors/RoomDetails fehlgeschlagen, Fallback RoomDetail: ${(err as Error).message}`,
    );
  }

  debug?.log('[EMMA debug] fetch via RoomDetail entity set');
  const countParts: ODataBatchPartSpec[] = [
    { path: roomDetailCountBatchPath(hotelId, sapClient), accept: 'plain' },
  ];
  const countText = await postEmmaBatch(
    jar,
    baseUrl,
    sapClient,
    csrfToken,
    'roomDetail.count',
    countParts,
    debug,
  );
  const countBody = parseODataBatchResponse(countText)[0]?.body ?? '';
  const total = parseODataCount(countBody) ?? pageSize;
  debug?.log(`[EMMA debug] RoomDetail $count=${total} raw=${countBody.trim().slice(0, 32)}`);

  const all: Record<string, unknown>[] = [];
  for (let skip = 0; skip < total; skip += pageSize) {
    const pageParts: ODataBatchPartSpec[] = [
      { path: roomDetailBatchPath(hotelId, sapClient, skip, pageSize) },
    ];
    const batchText = await postEmmaBatch(
      jar,
      baseUrl,
      sapClient,
      csrfToken,
      `roomDetail.page.${skip}`,
      pageParts,
      debug,
    );
    const rows = parseODataResultsJson(parseODataBatchResponse(batchText)[0]?.body ?? '');
    debug?.log(`[EMMA debug] RoomDetail skip=${skip}: ${rows.length} Zeilen`);
    logRawRowSample(debug, `roomDetail.${skip}`, rows);
    all.push(...rows);
  }
  return all;
}

/** EMMA stores OOO on Rooms/RoomRackDays (Status=OO), not on RoomDetail housekeeping codes. */
async function fetchOutOfOrderRoomNumbersFromRackDaysHttp(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  sapClient: string,
  csrfToken: string,
  pageSize = 999,
  debug?: EmmaSyncDebug,
): Promise<Set<string>> {
  const today = todayIsoDate();
  const ooo = new Set<string>();
  debug?.log(`[EMMA debug] fetch RoomRackDays OOO hotel=${hotelId} today=${today}`);

  const countParts: ODataBatchPartSpec[] = [
    { path: roomsWithRackDaysCountBatchPath(hotelId, sapClient), accept: 'plain' },
  ];
  const countText = await postEmmaBatch(
    jar,
    baseUrl,
    sapClient,
    csrfToken,
    'rooms.rackDays.count',
    countParts,
    debug,
  );
  const total = parseODataCount(parseODataBatchResponse(countText)[0]?.body ?? '') ?? pageSize;
  debug?.log(`[EMMA debug] Rooms $count=${total}`);

  for (let skip = 0; skip < total; skip += pageSize) {
    const pageParts: ODataBatchPartSpec[] = [
      { path: roomsWithRackDaysBatchPath(hotelId, sapClient, skip, pageSize) },
    ];
    const batchText = await postEmmaBatch(
      jar,
      baseUrl,
      sapClient,
      csrfToken,
      `rooms.rackDays.page.${skip}`,
      pageParts,
      debug,
    );
    const rows = parseODataResultsJson(parseODataBatchResponse(batchText)[0]?.body ?? '');
    debug?.log(`[EMMA debug] Rooms/RoomRackDays skip=${skip}: ${rows.length} Zeilen`);
    for (const row of rows) {
      const emmaRoomId = pickString(row, ['Room', 'RoomId', 'RoomNumber']);
      if (!emmaRoomId) continue;
      if (!roomHasActiveOutOfOrderRackDay(row, today)) continue;
      const roomNumber = normalizeEmmaRoomNumber(emmaRoomId);
      ooo.add(roomNumber);
      debug?.log(`[EMMA debug] RoomRackDays OOO: room=${roomNumber} emmaId=${emmaRoomId}`);
    }
  }

  debug?.log(`[EMMA debug] RoomRackDays OOO gesamt: ${ooo.size} Zimmer`);
  return ooo;
}

export function applyRackDaysOutOfOrder(
  snapshots: EmmaRoomStatusSnapshot[],
  oooRooms: Set<string>,
): EmmaRoomStatusSnapshot[] {
  if (oooRooms.size === 0) return snapshots;
  return snapshots.map((snap) =>
    oooRooms.has(snap.roomNumber) ? { ...snap, outOfOrder: true } : snap,
  );
}

function snapshotsFromRows(
  detailRows: Record<string, unknown>[],
  statusRows: Record<string, unknown>[],
  debug?: EmmaSyncDebug,
): EmmaRoomStatusSnapshot[] {
  const lookup = buildStatusLookup(statusRows);
  debug?.log(
    `[EMMA debug] Status-Lookup aus RoomStatus: ${lookup.size} Codes (${[...lookup.entries()].slice(0, 8).map(([k, v]) => `${k}=${v}`).join(', ')}${lookup.size > 8 ? '…' : ''})`,
  );
  const out: EmmaRoomStatusSnapshot[] = [];
  const seen = new Set<string>();
  const skipped: Array<{ reason: string; rowKeys: string[] }> = [];
  for (const row of detailRows) {
    const snap = mapEmmaRoomDetailRow(row, lookup);
    if (!snap) {
      skipped.push({
        reason: 'kein RoomId/RoomNumber in Zeile',
        rowKeys: Object.keys(row).filter((k) => !k.startsWith('__')),
      });
      continue;
    }
    if (seen.has(snap.roomNumber)) {
      skipped.push({
        reason: `Duplikat local=${snap.roomNumber} emmaId=${snap.emmaRoomId}`,
        rowKeys: Object.keys(row).filter((k) => !k.startsWith('__')),
      });
      continue;
    }
    seen.add(snap.roomNumber);
    out.push(snap);
  }
  logParsedSnapshots(debug, out, skipped);
  return out;
}

/** Plain HTTP + persisted cookies. */
export async function fetchEmmaRoomStatusSnapshotsHttp(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId = EMMA_DEFAULT_HOTEL_ID,
  sapClient = EMMA_DEFAULT_SAP_CLIENT,
  debug?: EmmaSyncDebug,
): Promise<EmmaRoomStatusSnapshot[]> {
  debug?.log(`[EMMA debug] fetchEmmaRoomStatusSnapshotsHttp hotel=${hotelId} sapClient=${sapClient}`);
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient);
  debug?.log('[EMMA debug] CSRF token erhalten');
  const pageSize = 999;
  let statusRows: Record<string, unknown>[] = [];
  try {
    const statusParts: ODataBatchPartSpec[] = [
      { path: roomStatusCountBatchPath(sapClient), accept: 'plain', showStatus: 'Y' },
      { path: roomStatusListBatchPath(sapClient, 0, pageSize), showStatus: 'Y' },
    ];
    const batchText = await postEmmaBatch(
      jar,
      baseUrl,
      sapClient,
      csrf,
      'roomStatus.lookup',
      statusParts,
      debug,
    );
    const parts = parseODataBatchResponse(batchText);
    statusRows = parseODataResultsJson(parts[1]?.body ?? '');
    debug?.log(`[EMMA debug] RoomStatus lookup: ${statusRows.length} Zeilen`);
    logRawRowSample(debug, 'roomStatus', statusRows);
  } catch (err) {
    debug?.warn(
      `[EMMA debug] RoomStatus batch fehlgeschlagen (optional): ${(err as Error).message}`,
    );
    statusRows = [];
  }
  const detailRows = await fetchAllRoomDetailRowsHttp(
    jar,
    baseUrl,
    hotelId,
    sapClient,
    csrf,
    pageSize,
    debug,
  );
  debug?.log(`[EMMA debug] detailRows gesamt: ${detailRows.length}`);
  let snapshots = snapshotsFromRows(detailRows, statusRows, debug);
  try {
    const oooRooms = await fetchOutOfOrderRoomNumbersFromRackDaysHttp(
      jar,
      baseUrl,
      hotelId,
      sapClient,
      csrf,
      pageSize,
      debug,
    );
    snapshots = applyRackDaysOutOfOrder(snapshots, oooRooms);
  } catch (err) {
    debug?.warn(
      `[EMMA debug] Rooms/RoomRackDays OOO fehlgeschlagen (optional): ${(err as Error).message}`,
    );
  }
  return snapshots;
}

/** Map EMMA housekeeping code/label → PrizeBern board status (source of truth after sync). */
export function mapEmmaToDerivedStatus(
  snap: Pick<EmmaRoomStatusSnapshot, 'statusCode' | 'statusLabel' | 'outOfOrder'>,
): DerivedRoomStatus | null {
  if (snap.outOfOrder) return DerivedRoomStatus.OUT_OF_ORDER;

  const code = (snap.statusCode ?? '').toUpperCase().replace(/\s+/g, '');
  const label = (snap.statusLabel ?? '').toLowerCase();

  if (
    /^O(OO|OS|OOO)?$/.test(code) ||
    /out\s*of\s*order|out-of-order|außer\s*betrieb|outoforder/.test(label)
  ) {
    return DerivedRoomStatus.OUT_OF_ORDER;
  }
  if (
    /^IN$/.test(code) ||
    /^INS(P|PECT|PECTED)?$/.test(code) ||
    /^VI(S)?$/.test(code) ||
    /inspect/.test(label)
  ) {
    return DerivedRoomStatus.INSPECTED;
  }
  if (
    /^CL(EAN|N|R)?$/.test(code) ||
    /^VC$/.test(code) ||
    /^OC$/.test(code) ||
    /^AC$/.test(code) ||
    (/\bclean\b/.test(label) && !/dirty/.test(label) && !/inspect/.test(label))
  ) {
    return DerivedRoomStatus.CLEAN;
  }
  if (
    /^IP(R|ROG)?$/.test(code) ||
    /^INP(ROG|ROGRESS)?$/.test(code) ||
    /^PIC(KUP)?$/.test(code) ||
    /^PU$/.test(code) ||
    /in\s*prog|in-progress|pickup|attending|being\s*cleaned/.test(label)
  ) {
    return DerivedRoomStatus.IN_PROGRESS;
  }
  if (
    /^DI(R(TY)?)?$/.test(code) ||
    /^D$/.test(code) ||
    /^OD$/.test(code) ||
    /^SO$/.test(code) ||
    /^DEP/.test(code) ||
    /dirty|departure|check-?out|checkout|unmade/.test(label)
  ) {
    return DerivedRoomStatus.DIRTY;
  }
  return null;
}

export type EmmaMetadataStored = {
  roomId: string;
  statusCode: string | null;
  statusLabel: string | null;
  derivedStatus: DerivedRoomStatus | null;
  outOfOrder: boolean;
  floorId: string | null;
  buildingId: string;
  syncedAt: string;
};

/** Metadata shape stored on `Room.metadata`. */
export function emmaMetadataPatch(snap: EmmaRoomStatusSnapshot, syncedAt: string): Record<string, unknown> {
  const derivedStatus = mapEmmaToDerivedStatus(snap);
  const emma: EmmaMetadataStored = {
    roomId: snap.emmaRoomId,
    statusCode: snap.statusCode,
    statusLabel: snap.statusLabel,
    derivedStatus,
    outOfOrder: snap.outOfOrder,
    floorId: snap.floorId,
    buildingId: snap.buildingId ?? EMMA_DEFAULT_BUILDING_ID,
    syncedAt,
  };
  return { emma };
}

export function readEmmaMetadata(metadata: unknown): EmmaMetadataStored | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const emma = (metadata as { emma?: unknown }).emma;
  if (!emma || typeof emma !== 'object' || Array.isArray(emma)) return null;
  const row = emma as Record<string, unknown>;
  const derived = row.derivedStatus;
  const derivedStatus =
    derived === DerivedRoomStatus.OUT_OF_ORDER ||
    derived === DerivedRoomStatus.DIRTY ||
    derived === DerivedRoomStatus.IN_PROGRESS ||
    derived === DerivedRoomStatus.CLEAN ||
    derived === DerivedRoomStatus.INSPECTED
      ? derived
      : null;
  return {
    roomId: typeof row.roomId === 'string' ? row.roomId : '',
    statusCode: typeof row.statusCode === 'string' ? row.statusCode : null,
    statusLabel: typeof row.statusLabel === 'string' ? row.statusLabel : null,
    derivedStatus,
    outOfOrder: row.outOfOrder === true,
    floorId: typeof row.floorId === 'string' ? row.floorId : null,
    buildingId: typeof row.buildingId === 'string' ? row.buildingId : EMMA_DEFAULT_BUILDING_ID,
    syncedAt: typeof row.syncedAt === 'string' ? row.syncedAt : '',
  };
}

export type ApplyEmmaSnapshotsDeps = {
  findRooms: () => Promise<Array<{ id: string; roomNumber: string; metadata: unknown; outOfOrder: boolean }>>;
  updateRoom: (
    id: string,
    data: { metadata: Record<string, unknown>; outOfOrder: boolean },
  ) => Promise<void>;
};

/** Write EMMA snapshots onto local `Room` rows (metadata.emma + outOfOrder). */
export async function applyEmmaSnapshotsToRooms(
  deps: ApplyEmmaSnapshotsDeps,
  snapshots: EmmaRoomStatusSnapshot[],
  hotelId: string,
): Promise<EmmaRoomStatusSyncResult> {
  const syncedAt = new Date().toISOString();
  const localRooms = await deps.findRooms();
  const byNumber = new Map(localRooms.map((r) => [r.roomNumber, r]));
  const matchedNumbers = new Set<string>();
  let updated = 0;

  for (const snap of snapshots) {
    const room = byNumber.get(snap.roomNumber);
    if (!room) continue;
    matchedNumbers.add(snap.roomNumber);
    const prevMeta =
      room.metadata && typeof room.metadata === 'object' && !Array.isArray(room.metadata)
        ? (room.metadata as Record<string, unknown>)
        : {};
    const nextEmma = emmaMetadataPatch(snap, syncedAt).emma as EmmaMetadataStored;
    const prevEmma = readEmmaMetadata(prevMeta);
    const nextMeta = { ...prevMeta, emma: nextEmma };
    const nextOoo = snap.outOfOrder;
    const statusChanged =
      !prevEmma ||
      prevEmma.derivedStatus !== nextEmma.derivedStatus ||
      prevEmma.statusCode !== nextEmma.statusCode ||
      prevEmma.outOfOrder !== nextEmma.outOfOrder;
    const oooChanged = room.outOfOrder !== nextOoo;
    if (!statusChanged && !oooChanged) continue;
    await deps.updateRoom(room.id, { metadata: nextMeta, outOfOrder: nextOoo });
    updated += 1;
  }

  const unmatchedEmma = snapshots
    .map((s) => s.roomNumber)
    .filter((n) => !byNumber.has(n));
  const unmatchedLocal = localRooms
    .map((r) => r.roomNumber)
    .filter((n) => !matchedNumbers.has(n));

  return {
    hotelId,
    syncedAt,
    emmaRooms: snapshots.length,
    matched: matchedNumbers.size,
    updated,
    unmatchedEmma: [...new Set(unmatchedEmma)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    unmatchedLocal: unmatchedLocal.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  };
}
