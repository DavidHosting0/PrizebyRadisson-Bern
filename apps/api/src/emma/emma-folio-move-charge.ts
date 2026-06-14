import { Logger } from '@nestjs/common';
import type { EmmaMoveFolioChargeParams, EmmaMoveFolioChargeResult } from '@housekeeping/shared';
import { normalizeFolioId } from '@housekeeping/shared';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  acquireEmmaFolioEditSession,
  releaseEmmaFolioEditSession,
  saveEmmaFolioDraft,
} from './emma-folio-edit-session';
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
} from './emma-odata-client';

const log = new Logger('EmmaFolioMoveCharge');

function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

function parseMoveChargeResult(
  body: string,
  destinationFolioId: string,
): EmmaMoveFolioChargeResult {
  const entity = parseODataEntityJson(body);
  if (!entity) {
    throw new Error('EMMA MoveCharge returned empty response');
  }
  const result: EmmaMoveFolioChargeResult = {
    chargeId: String(entity.Id ?? ''),
    concept: str(entity.Concept),
    folioId: str(entity.Folio),
    amount: str(entity.Amount),
    description: str(entity.Description),
    statusCharge: str(entity.StatusCharge),
  };
  const dest = normalizeFolioId(destinationFolioId);
  const actual = normalizeFolioId(result.folioId);
  if (dest && actual && dest !== actual) {
    log.warn(
      `[EMMA] MoveCharge response Folio=${actual} (expected ${dest} after save) — draft may still apply on POST Draft`,
    );
  }
  return result;
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
  return parseMoveChargeResult(part.body, '');
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
 * Move a single folio charge in EMMA:
 * ManageLocks → Draft → ValidateMoveCharge → CheckEmployeeAuth → MoveCharge → Draft save → Unlock.
 * Captured from movingcharges.com.har + foliomanagement.com.har (lock/draft session).
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

  // Hard rule: a charge may only be moved between folios of the same reservation.
  // Cross-reservation moves are technically possible in EMMA but never intended
  // for the arrival check (the rules engine never plans them). Block any attempt.
  if (destinationReservationId !== reservationId) {
    throw new Error(
      `MANUAL: Cross-Reservation-Move blockiert (Quelle=${reservationId}, Ziel=${destinationReservationId}). ` +
        `Charges dürfen nur innerhalb derselben Reservierung verschoben werden.`,
    );
  }
  // Equally critical: source and destination folio must differ — moving a charge
  // onto its own folio is meaningless and could only hide a logic bug upstream.
  if (sourceFolioId.padStart(2, '0') === destinationFolioId.padStart(2, '0')) {
    throw new Error(
      `MANUAL: Quell- und Ziel-Folio sind identisch (${sourceFolioId}) – Move abgebrochen.`,
    );
  }

  const employee = opts.employee?.trim();
  if (!employee) {
    throw new Error('EMMA operator employee number required for MoveCharge');
  }

  const session = await acquireEmmaFolioEditSession(
    jar,
    baseUrl,
    hotelId,
    reservationId,
    employee,
    sapClient,
    opts.debug,
  );

  try {
    const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
    const requestObjectKey = session.requestObjectKey;

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

    const movePath = moveChargePath({
      sapClient,
      hotelId,
      reservationId,
      sourceFolioId,
      chargeRowId,
      destinationFolioId,
      destinationReservationId,
      employee,
    });

    const { body, contentType } = buildODataChangesetBatchBody(
      [{ actionPath: movePath }],
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
      { label: 'MoveCharge', debug: opts.debug },
    );
    const parts = parseODataBatchResponse(raw);
    const part = parts[parts.length - 1];
    if (!part || part.status < 200 || part.status >= 300) {
      const status = part?.status ?? 'missing';
      const snippet = part?.body?.slice(0, 300) ?? '';
      throw new Error(`EMMA MoveCharge failed (HTTP ${status}): ${snippet}`);
    }

    const result = parseMoveChargeResult(part.body, destinationFolioId);

    await saveEmmaFolioDraft(jar, baseUrl, session, opts.debug);

    log.log(
      `[EMMA] moved charge ${chargeRowId} ${result.concept ?? '?'} ` +
        `${sourceFolioId} → ${destinationFolioId} on ${reservationId}`,
    );
    return result;
  } finally {
    await releaseEmmaFolioEditSession(jar, baseUrl, session, opts.debug);
  }
}
