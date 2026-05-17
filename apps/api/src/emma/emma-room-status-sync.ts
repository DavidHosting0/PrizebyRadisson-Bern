import type { EmmaCookieJar } from './emma-cookie-jar';
import {
  emmaHttpFetchCsrfToken,
  emmaHttpPostBatch,
} from './emma-http-auth';
import {
  buildODataBatchBody,
  EMMA_DEFAULT_BUILDING_ID,
  EMMA_DEFAULT_HOTEL_ID,
  EMMA_DEFAULT_SAP_CLIENT,
  EMMA_ODATA_RSRVS_SRV,
  parseODataBatchResponse,
  parseODataCount,
  parseODataResultsJson,
  roomDetailBatchPath,
  roomDetailCountBatchPath,
} from './emma-odata-client';

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

function detectOutOfOrder(row: Record<string, unknown>, statusCode: string | null): boolean {
  if (
    isTruthyFlag(pickField(row, ['OutOfOrder', 'Ooo', 'IsOutOfOrder', 'RoomOutOfOrder', 'OutOfService']))
  ) {
    return true;
  }
  const text = [
    pickString(row, ['StatusText', 'RoomStatusText', 'HkStatusText', 'Description']),
    pickString(row, ['Remark', 'Comments']),
  ]
    .filter(Boolean)
    .join(' ');
  if (/out\s*of\s*order|ooo|außer\s*betrieb/i.test(text)) return true;
  if (statusCode && /^O(OO)?$/i.test(statusCode)) return true;
  return false;
}

function extractStatusCode(row: Record<string, unknown>): string | null {
  const raw = pickString(row, [
    'HkStatus',
    'HKStatus',
    'RoomStatus',
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

async function fetchAllRoomDetailRowsHttp(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  sapClient: string,
  csrfToken: string,
  pageSize = 999,
): Promise<Record<string, unknown>[]> {
  const countBatch = buildODataBatchBody(
    [{ path: roomDetailCountBatchPath(hotelId, sapClient), accept: 'plain' }],
    csrfToken,
  );
  const countText = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrfToken,
    countBatch.body,
    countBatch.contentType,
  );
  const total = parseODataCount(parseODataBatchResponse(countText)[0]?.body ?? '') ?? pageSize;
  const all: Record<string, unknown>[] = [];
  for (let skip = 0; skip < total; skip += pageSize) {
    const { body, contentType } = buildODataBatchBody(
      [{ path: roomDetailBatchPath(hotelId, sapClient, skip, pageSize) }],
      csrfToken,
    );
    const batchText = await emmaHttpPostBatch(
      jar,
      baseUrl,
      EMMA_ODATA_RSRVS_SRV,
      sapClient,
      csrfToken,
      body,
      contentType,
    );
    all.push(...parseODataResultsJson(parseODataBatchResponse(batchText)[0]?.body ?? ''));
  }
  return all;
}

function snapshotsFromRows(
  detailRows: Record<string, unknown>[],
  statusRows: Record<string, unknown>[],
): EmmaRoomStatusSnapshot[] {
  const lookup = buildStatusLookup(statusRows);
  const out: EmmaRoomStatusSnapshot[] = [];
  const seen = new Set<string>();
  for (const row of detailRows) {
    const snap = mapEmmaRoomDetailRow(row, lookup);
    if (!snap || seen.has(snap.roomNumber)) continue;
    seen.add(snap.roomNumber);
    out.push(snap);
  }
  return out;
}

/** Plain HTTP + persisted cookies. */
export async function fetchEmmaRoomStatusSnapshotsHttp(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId = EMMA_DEFAULT_HOTEL_ID,
  sapClient = EMMA_DEFAULT_SAP_CLIENT,
): Promise<EmmaRoomStatusSnapshot[]> {
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient);
  let statusRows: Record<string, unknown>[] = [];
  try {
    const { body, contentType } = buildODataBatchBody(
      [{ path: `RoomStatus?sap-client=${sapClient}&$skip=0&$top=999` }],
      csrf,
    );
    const batchText = await emmaHttpPostBatch(
      jar,
      baseUrl,
      EMMA_ODATA_RSRVS_SRV,
      sapClient,
      csrf,
      body,
      contentType,
    );
    statusRows = parseODataResultsJson(parseODataBatchResponse(batchText)[0]?.body ?? '');
  } catch {
    statusRows = [];
  }
  const detailRows = await fetchAllRoomDetailRowsHttp(jar, baseUrl, hotelId, sapClient, csrf);
  return snapshotsFromRows(detailRows, statusRows);
}

/** Metadata shape stored on `Room.metadata`. */
export function emmaMetadataPatch(snap: EmmaRoomStatusSnapshot, syncedAt: string): Record<string, unknown> {
  return {
    emma: {
      roomId: snap.emmaRoomId,
      statusCode: snap.statusCode,
      statusLabel: snap.statusLabel,
      outOfOrder: snap.outOfOrder,
      floorId: snap.floorId,
      buildingId: snap.buildingId ?? EMMA_DEFAULT_BUILDING_ID,
      syncedAt,
    },
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
    const nextMeta = { ...prevMeta, ...emmaMetadataPatch(snap, syncedAt) };
    const nextOoo = snap.outOfOrder;
    const metaChanged = JSON.stringify(prevMeta.emma) !== JSON.stringify(nextMeta.emma);
    const oooChanged = room.outOfOrder !== nextOoo;
    if (!metaChanged && !oooChanged) continue;
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
