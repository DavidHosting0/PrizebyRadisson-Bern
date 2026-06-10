import { Logger } from '@nestjs/common';
import type { EmmaMoveFolioChargeParams, EmmaMoveFolioChargeResult } from '@housekeeping/shared';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  buildODataBatchBody,
  buildODataChangesetBatchBody,
  checkEmployeeAuthPath,
  EMMA_DEFAULT_SAP_CLIENT,
  EMMA_ODATA_HOTEL_SRV,
  EMMA_ODATA_RSRVS_SRV,
  moveChargePath,
  parseODataBatchResponse,
  parseODataEntityJson,
  validateMoveChargePath,
  buildEmmaRequestObjectKey,
} from './emma-odata-client';

const log = new Logger('EmmaFolioMoveCharge');

function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

function parseMoveChargeResult(body: string): EmmaMoveFolioChargeResult {
  const entity = parseODataEntityJson(body);
  if (!entity) {
    throw new Error('EMMA MoveCharge returned empty response');
  }
  return {
    chargeId: String(entity.Id ?? ''),
    concept: str(entity.Concept),
    folioId: str(entity.Folio),
    amount: str(entity.Amount),
    description: str(entity.Description),
    statusCharge: str(entity.StatusCharge),
  };
}

async function postChangesetAction(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  actionPath: string,
  label: string,
  requestObjectKey: string,
  debug?: EmmaSyncDebug,
): Promise<EmmaMoveFolioChargeResult | null> {
  const { body, contentType } = buildODataChangesetBatchBody(
    [{ actionPath }],
    csrf,
    { requestObjectKey },
  );
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrf,
    body,
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
  if (label === 'ValidateMoveCharge') return null;
  return parseMoveChargeResult(part.body);
}

async function assertEmployeeCanMoveCharge(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  hotelId: string,
  employee: string,
  debug?: EmmaSyncDebug,
): Promise<void> {
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_HOTEL_SRV);
  const path = checkEmployeeAuthPath(sapClient, hotelId, employee);
  const { body, contentType } = buildODataBatchBody([{ path }], csrf);
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_HOTEL_SRV,
    sapClient,
    csrf,
    body,
    contentType,
    { label: 'CheckEmployeeAuth.move', debug, parts: [{ path }] },
  );
  const parts = parseODataBatchResponse(raw);
  const part = parts[0];
  if (!part || part.status < 200 || part.status >= 300) {
    throw new Error(`EMMA CheckEmployeeAuth failed (HTTP ${part?.status ?? 'missing'})`);
  }
  const entity = parseODataEntityJson(part.body);
  const auth = entity?.CheckEmployeeAuth as Record<string, unknown> | undefined;
  const type = str(auth?.Type);
  const message = str(auth?.Message);
  if (type !== 'X') {
    throw new Error(message || 'EMMA employee not authorized to move charges (Action 0004).');
  }
}

/**
 * Move a single folio charge in EMMA (ValidateMoveCharge → CheckEmployeeAuth → MoveCharge).
 * Captured from movingcharges.com.har.
 */
export async function moveEmmaFolioChargeFromJar(
  jar: EmmaCookieJar,
  baseUrl: string,
  opts: EmmaMoveFolioChargeParams & {
    sapClient?: string;
    debug?: EmmaSyncDebug;
  },
): Promise<EmmaMoveFolioChargeResult> {
  const hotelId = opts.hotelId.trim();
  const reservationId = opts.reservationId.trim();
  const sourceFolioId = opts.sourceFolioId.trim();
  const chargeRowId = opts.chargeRowId.trim();
  const destinationFolioId = opts.destinationFolioId.trim();
  const destinationReservationId = (opts.destinationReservationId ?? reservationId).trim();
  const sapClient = opts.sapClient?.trim() || EMMA_DEFAULT_SAP_CLIENT;
  const validate = opts.validate !== false;

  if (!hotelId || !reservationId || !sourceFolioId || !chargeRowId || !destinationFolioId) {
    throw new Error('hotelId, reservationId, sourceFolioId, chargeRowId and destinationFolioId required');
  }

  const employee = opts.employee?.trim();
  if (!employee) {
    throw new Error('EMMA operator employee number required for MoveCharge');
  }

  const requestObjectKey = buildEmmaRequestObjectKey(hotelId, reservationId);
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);

  if (validate) {
    await postChangesetAction(
      jar,
      baseUrl,
      sapClient,
      csrf,
      validateMoveChargePath({
        sapClient,
        hotelId,
        reservationId,
        sourceFolioId,
        chargeRowId,
      }),
      'ValidateMoveCharge',
      requestObjectKey,
      opts.debug,
    );
  }

  await assertEmployeeCanMoveCharge(jar, baseUrl, sapClient, hotelId, employee, opts.debug);

  const result = await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    moveChargePath({
      sapClient,
      hotelId,
      reservationId,
      sourceFolioId,
      chargeRowId,
      destinationFolioId,
      destinationReservationId,
      employee,
    }),
    'MoveCharge',
    requestObjectKey,
    opts.debug,
  );

  if (!result) {
    throw new Error('EMMA MoveCharge returned no charge payload');
  }

  log.log(
    `[EMMA] moved charge ${chargeRowId} ${result.concept ?? '?'} ` +
      `${sourceFolioId} → ${destinationFolioId} on ${reservationId}`,
  );
  return result;
}
