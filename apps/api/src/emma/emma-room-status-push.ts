import { DerivedRoomStatus } from '@housekeeping/shared';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  buildODataChangesetMergeBatchBody,
  buildRoomStatusMergeJson,
  EMMA_ODATA_RSRVS_SRV,
  parseODataBatchResponse,
  roomDetailMergePath,
} from './emma-odata-client';

export type EmmaRoomStatusCode = 'CL' | 'DI' | 'IN';

export type EmmaRoomStatusPushTarget = 'CLEAN' | 'INSPECTED' | 'DIRTY';

/** EMMA OData room id (4-digit padding, e.g. 9 → 0009). */
export function formatEmmaRoomId(roomNumber: string, storedEmmaRoomId?: string | null): string {
  const stored = storedEmmaRoomId?.trim();
  if (stored) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n) && n > 0) return String(n).padStart(4, '0');
    return stored.padStart(4, '0');
  }
  const n = parseInt(roomNumber.trim(), 10);
  if (Number.isFinite(n) && n > 0) return String(n).padStart(4, '0');
  return roomNumber.trim().padStart(4, '0');
}

export function mapDerivedStatusToEmmaCode(
  status: EmmaRoomStatusPushTarget,
): EmmaRoomStatusCode | null {
  switch (status) {
    case 'CLEAN':
      return 'CL';
    case 'INSPECTED':
      return 'IN';
    case 'DIRTY':
      return 'DI';
    default:
      return null;
  }
}

export function emmaCodeToDerivedStatus(code: EmmaRoomStatusCode): DerivedRoomStatus {
  switch (code) {
    case 'CL':
      return DerivedRoomStatus.CLEAN;
    case 'IN':
      return DerivedRoomStatus.INSPECTED;
    case 'DI':
    default:
      return DerivedRoomStatus.DIRTY;
  }
}

export async function pushEmmaRoomStatusHttp(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  sapClient: string,
  emmaRoomId: string,
  statusCode: EmmaRoomStatusCode,
  debug?: EmmaSyncDebug,
): Promise<void> {
  const odataBaseUrl = baseUrl.replace(/\/$/, '');
  const mergePath = roomDetailMergePath(hotelId, emmaRoomId, sapClient);
  const mergeBody = buildRoomStatusMergeJson(odataBaseUrl, hotelId, emmaRoomId, statusCode);

  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
  const { body, contentType } = buildODataChangesetMergeBatchBody(
    [{ entityPath: mergePath, body: mergeBody }],
    csrf,
  );

  debug?.log(`[EMMA push] MERGE ${mergePath} RoomStatus=${statusCode}`);

  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrf,
    body,
    contentType,
    { label: 'roomStatus.push', debug },
  );

  const parts = parseODataBatchResponse(raw);
  const mergePart = parts.find((p) => p.status === 204 || p.status === 200);
  if (!mergePart || (mergePart.status !== 204 && mergePart.status !== 200)) {
    const failed = parts.find((p) => p.status >= 400) ?? parts[0];
    const snippet = failed?.body?.slice(0, 240) ?? 'empty batch response';
    throw new Error(
      `EMMA RoomStatus MERGE failed (HTTP ${failed?.status ?? 0}): ${snippet}`,
    );
  }
}
