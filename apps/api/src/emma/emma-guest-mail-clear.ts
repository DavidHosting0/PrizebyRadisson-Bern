import { Logger } from '@nestjs/common';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  buildEmmaRequestObjectKey,
  buildODataChangesetBatchBody,
  EMMA_ODATA_RSRVS_SRV,
  emmaODataStringLiteral,
  manageLocksPath,
  parseODataBatchResponse,
  parseODataEntityJson,
} from './emma-odata-client';

const log = new Logger('EmmaGuestMailClear');

export type ClearEmmaGuestMailParams = {
  hotelId: string;
  reservationId: string;
  guestId: string;
  employee: string;
  sapClient: string;
  debug?: EmmaSyncDebug;
};

function guestsEntityKey(hotelId: string, reservationId: string, guestId: string): string {
  const q = emmaODataStringLiteral;
  const gid = guestId.trim().padStart(2, '0');
  return `Guests(HotelId=${q(hotelId)},ReservationId=${q(reservationId)},GuestId=${q(gid)})`;
}

function guestsMergePath(
  hotelId: string,
  reservationId: string,
  guestId: string,
  sapClient: string,
): string {
  return `${guestsEntityKey(hotelId, reservationId, guestId)}?sap-client=${sapClient}`;
}

function buildGuestMailClearJson(
  odataBaseUrl: string,
  hotelId: string,
  reservationId: string,
  guestId: string,
): string {
  const entityKey = guestsEntityKey(hotelId, reservationId, guestId);
  const uri = `${odataBaseUrl.replace(/\/$/, '')}/sap/opu/odata/sap/${EMMA_ODATA_RSRVS_SRV}/${entityKey}`;
  return JSON.stringify({
    __metadata: {
      uri,
      type: `${EMMA_ODATA_RSRVS_SRV}.Guests`,
    },
    Mail: '',
  });
}

function assertManageLocksOk(body: string, label: string): void {
  const entity = parseODataEntityJson(body);
  const success = entity?.Success;
  if (success === true || success === 'true') return;
  const message = entity?.Message != null ? String(entity.Message).trim() : '';
  throw new Error(message || `EMMA ${label} did not succeed`);
}

function isOwnSessionLockConflict(message: string): boolean {
  return /blocked by your user|close the other session/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postManageLocks(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  session: { hotelId: string; employee: string; requestObjectKey: string },
  opts: { lock: boolean; unlock?: boolean; forceLock?: boolean },
  debug?: EmmaSyncDebug,
): Promise<void> {
  const actionPath = manageLocksPath({
    sapClient,
    hotelId: session.hotelId,
    employee: session.employee,
    requestObjectKey: session.requestObjectKey,
    lock: opts.lock,
    unlock: opts.unlock ?? false,
    forceLock: opts.forceLock ?? false,
  });
  const label = opts.unlock ? 'ManageLocks.unlock' : 'ManageLocks.lock';
  const { body: batchBody, contentType } = buildODataChangesetBatchBody(
    [{ actionPath }],
    csrf,
    { requestObjectKey: session.requestObjectKey },
  );
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrf,
    batchBody,
    contentType,
    { label, debug },
  );
  const parts = parseODataBatchResponse(raw);
  const part = parts[parts.length - 1];
  if (!part || part.status < 200 || part.status >= 300) {
    throw new Error(
      `EMMA ${label} failed (HTTP ${part?.status ?? 0}): ${part?.body?.slice(0, 240) ?? ''}`,
    );
  }
  assertManageLocksOk(part.body, label);
}

async function unlockGuestMailSession(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  session: { hotelId: string; employee: string; requestObjectKey: string },
  reservationId: string,
  debug?: EmmaSyncDebug,
): Promise<void> {
  for (const forceLock of [false, true]) {
    try {
      const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
      await postManageLocks(
        jar,
        baseUrl,
        sapClient,
        csrf,
        session,
        { lock: false, unlock: true, forceLock },
        debug,
      );
      await sleep(250);
      return;
    } catch (err) {
      if (forceLock) {
        log.warn(
          `[EMMA] unlock after guest Mail clear failed for ${reservationId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}

/**
 * Clear reservation guest Mail via EMMA Guests MERGE (Mail:""), matching the
 * browser HAR: lock → MERGE Guests → unlock. No BP / YEM_UI_BP_SRV write.
 */
export async function clearEmmaGuestMailFromJar(
  jar: EmmaCookieJar,
  baseUrl: string,
  params: ClearEmmaGuestMailParams,
): Promise<void> {
  const hotelId = params.hotelId.trim();
  const reservationId = params.reservationId.trim();
  const guestId = (params.guestId.trim() || '01').padStart(2, '0');
  const sapClient = params.sapClient.trim();
  const employee = params.employee.trim();
  if (!hotelId || !reservationId || !employee) {
    throw new Error('hotelId, reservationId und employee sind für Guests Mail-Clear erforderlich.');
  }

  const requestObjectKey = buildEmmaRequestObjectKey(hotelId, reservationId);
  const session = { hotelId, employee, requestObjectKey };
  const odataBaseUrl = baseUrl.replace(/\/$/, '');
  const mergePath = guestsMergePath(hotelId, reservationId, guestId, sapClient);
  const mergeBody = buildGuestMailClearJson(odataBaseUrl, hotelId, reservationId, guestId);

  let locked = false;
  try {
    const lockOnce = async () => {
      const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
      await postManageLocks(jar, baseUrl, sapClient, csrf, session, { lock: true }, params.debug);
    };

    try {
      await lockOnce();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isOwnSessionLockConflict(message)) throw err;
      log.warn(
        `[EMMA] own-session lock conflict before guest Mail clear for ${reservationId} — force closing and retrying`,
      );
      await unlockGuestMailSession(jar, baseUrl, sapClient, session, reservationId, params.debug);
      await sleep(500);
      await lockOnce();
    }
    locked = true;

    const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
    const { body: batchBody, contentType } = buildODataChangesetBatchBody(
      [{ actionPath: mergePath, body: mergeBody, method: 'MERGE' }],
      csrf,
      {
        requestObjectKey,
        tmsFioriApp: 'Reservations',
      },
    );

    log.log(
      `[EMMA] clear guest Mail reservation=${reservationId} guest=${guestId} key=${requestObjectKey}`,
    );

    const raw = await emmaHttpPostBatch(
      jar,
      baseUrl,
      EMMA_ODATA_RSRVS_SRV,
      sapClient,
      csrf,
      batchBody,
      contentType,
      { label: 'guests.clearMail', debug: params.debug },
    );

    const parts = parseODataBatchResponse(raw);
    const mergePart = parts.find((p) => p.status === 204 || p.status === 200);
    if (!mergePart || (mergePart.status !== 204 && mergePart.status !== 200)) {
      const failed = parts.find((p) => p.status >= 400) ?? parts[0];
      throw new Error(
        `EMMA Guests Mail MERGE failed (HTTP ${failed?.status ?? 0}): ${
          failed?.body?.slice(0, 240) ?? 'empty batch response'
        }`,
      );
    }
  } finally {
    if (locked) {
      await unlockGuestMailSession(jar, baseUrl, sapClient, session, reservationId, params.debug);
    }
  }
}
