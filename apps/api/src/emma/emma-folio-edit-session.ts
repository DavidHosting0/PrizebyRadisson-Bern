import { Logger } from '@nestjs/common';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  buildEmmaRequestObjectKey,
  buildODataChangesetBatchBody,
  createDraftPath,
  draftCreateBody,
  EMMA_ODATA_RSRVS_SRV,
  manageLocksPath,
  parseODataBatchResponse,
  parseODataEntityJson,
} from './emma-odata-client';

const log = new Logger('EmmaFolioEditSession');

export type EmmaFolioEditSession = {
  requestObjectKey: string;
  hotelId: string;
  reservationId: string;
  employee: string;
  sapClient: string;
};

async function postChangeset(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  actionPath: string,
  requestObjectKey: string,
  label: string,
  body?: string,
  debug?: EmmaSyncDebug,
): Promise<void> {
  const { body: batchBody, contentType } = buildODataChangesetBatchBody(
    [{ actionPath, body }],
    csrf,
    { requestObjectKey },
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
    const status = part?.status ?? 'missing';
    const snippet = part?.body?.slice(0, 300) ?? '';
    throw new Error(`EMMA ${label} failed (HTTP ${status}): ${snippet}`);
  }
}

function assertManageLocksOk(body: string, label: string): void {
  const entity = parseODataEntityJson(body);
  const success = entity?.Success;
  if (success === true || success === 'true') return;
  const message = entity?.Message != null ? String(entity.Message).trim() : '';
  throw new Error(message || `EMMA ${label} did not succeed`);
}

async function postManageLocks(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  session: Pick<EmmaFolioEditSession, 'requestObjectKey' | 'hotelId' | 'employee'>,
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
    const status = part?.status ?? 'missing';
    throw new Error(`EMMA ${label} failed (HTTP ${status})`);
  }
  assertManageLocksOk(part.body, label);
}

/** Open Folio Management edit session (ManageLocks + Draft), required before MoveCharge. */
export async function acquireEmmaFolioEditSession(
  jar: EmmaCookieJar,
  baseUrl: string,
  hotelId: string,
  reservationId: string,
  employee: string,
  sapClient: string,
  debug?: EmmaSyncDebug,
): Promise<EmmaFolioEditSession> {
  const requestObjectKey = buildEmmaRequestObjectKey(hotelId, reservationId);
  const session: EmmaFolioEditSession = {
    requestObjectKey,
    hotelId,
    reservationId,
    employee,
    sapClient,
  };
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);

  await postManageLocks(jar, baseUrl, sapClient, csrf, session, { lock: true }, debug);
  await postChangeset(
    jar,
    baseUrl,
    sapClient,
    csrf,
    createDraftPath(sapClient),
    requestObjectKey,
    'Draft.create',
    draftCreateBody(hotelId, reservationId),
    debug,
  );

  log.log(`[EMMA] folio edit session opened for ${reservationId} (${requestObjectKey})`);
  return session;
}

/** Persist draft changes (POST Draft — foliomanagement.com.har after charge moves). */
export async function saveEmmaFolioDraft(
  jar: EmmaCookieJar,
  baseUrl: string,
  session: EmmaFolioEditSession,
  debug?: EmmaSyncDebug,
): Promise<void> {
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, session.sapClient, EMMA_ODATA_RSRVS_SRV);
  await postChangeset(
    jar,
    baseUrl,
    session.sapClient,
    csrf,
    createDraftPath(session.sapClient),
    session.requestObjectKey,
    'Draft.save',
    draftCreateBody(session.hotelId, session.reservationId),
    debug,
  );
  log.log(`[EMMA] folio draft saved for ${session.reservationId}`);
}

/** Release reservation lock after folio edits. Errors are logged, not thrown. */
export async function releaseEmmaFolioEditSession(
  jar: EmmaCookieJar,
  baseUrl: string,
  session: EmmaFolioEditSession,
  debug?: EmmaSyncDebug,
): Promise<void> {
  const unlock = async (forceLock: boolean) => {
    const csrf = await emmaHttpFetchCsrfToken(
      jar,
      baseUrl,
      session.sapClient,
      EMMA_ODATA_RSRVS_SRV,
    );
    await postManageLocks(
      jar,
      baseUrl,
      session.sapClient,
      csrf,
      session,
      { lock: false, unlock: true, forceLock },
      debug,
    );
  };

  try {
    await unlock(false);
    log.log(`[EMMA] folio edit session released for ${session.reservationId}`);
  } catch (firstErr) {
    try {
      await unlock(true);
      log.log(
        `[EMMA] folio edit session released for ${session.reservationId} (force unlock)`,
      );
    } catch (err) {
      log.warn(
        `[EMMA] failed to release folio lock for ${session.reservationId}: ${(err as Error).message}` +
          (firstErr instanceof Error ? ` (first: ${firstErr.message})` : ''),
      );
    }
  }
}
