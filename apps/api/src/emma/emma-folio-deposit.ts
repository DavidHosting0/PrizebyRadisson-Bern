import { Logger } from '@nestjs/common';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  amountsMatch,
  assertDepositMatchesCharge,
  filterCreditCardsForReservation,
  pickDepositForFolio2Amount,
  type EmmaDepositRow,
} from '../arrival-check/arrival-check-payment-guard';
import {
  buildEmmaRequestObjectKey,
  buildODataBatchBody,
  buildODataChangesetBatchBody,
  collectPaymWoInvPath,
  createDepositBody,
  createDepositPath,
  depositsFilterPath,
  EMMA_DEFAULT_SAP_CLIENT,
  EMMA_ODATA_RSRVS_SRV,
  EMMA_PAYMENT_METHOD_TOKEN,
  extractODataErrorMessage,
  getEmployeeTillIdPath,
  parseODataBatchResponse,
  parseODataEntityJson,
  parseODataResultsJson,
  roundDepositPath,
} from './emma-odata-client';
import {
  selectChargeableVcc,
  type VccSelection,
} from '../arrival-check/arrival-check-vcc';
import { fetchEmmaReservationCreditCardsFromJar } from './emma-folio-payment';
import type { EmmaVccPaymentOutcome } from './emma-folio-payment';

const log = new Logger('EmmaFolioDeposit');

function tokenSuffix(token: string): string {
  const t = token.trim();
  return t.length >= 4 ? t.slice(-4) : '????';
}

async function postChangesetAction(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  actionPath: string,
  label: string,
  requestObjectKey: string,
  opts: { allowError?: boolean; debug?: EmmaSyncDebug; body?: string } = {},
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const { body, contentType } = buildODataChangesetBatchBody(
    [{ actionPath, body: opts.body }],
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
    { label, debug: opts.debug },
  );
  const parts = parseODataBatchResponse(raw);
  const part = parts[parts.length - 1];
  if (!part) {
    throw new Error(`EMMA ${label} returned no response part`);
  }
  if (!opts.allowError && (part.status < 200 || part.status >= 300)) {
    const snippet = extractODataErrorMessage(part.body) ?? part.body.slice(0, 300);
    throw new Error(`EMMA ${label} failed (HTTP ${part.status}): ${snippet}`);
  }
  return { status: part.status, body: part.body, headers: part.headers };
}

async function fetchDeposits(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  hotelId: string,
  reservationId: string,
  debug?: EmmaSyncDebug,
): Promise<EmmaDepositRow[]> {
  const path = depositsFilterPath({ sapClient, hotelId, reservationId });
  const { body, contentType } = buildODataBatchBody(
    [{ path, tmsFioriApp: 'Reservations', tmsFilterTab: 'Overview' }],
    csrf,
  );
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrf,
    body,
    contentType,
    { label: `deposits.${reservationId}`, debug },
  );
  const parts = parseODataBatchResponse(raw);
  const part = parts[0];
  if (!part || part.status < 200 || part.status >= 300) {
    throw new Error(`EMMA Deposits fetch failed (HTTP ${part?.status ?? 'missing'})`);
  }
  return parseODataResultsJson(part.body) as EmmaDepositRow[];
}

function findDepositById(rows: EmmaDepositRow[], depositId: string): EmmaDepositRow | null {
  const id = depositId.trim();
  return rows.find((row) => String(row.Id ?? '').trim() === id) ?? null;
}

async function createDeposit(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  hotelId: string,
  reservationId: string,
  amount: string,
  currency: string,
  requestObjectKey: string,
  debug?: EmmaSyncDebug,
): Promise<EmmaDepositRow> {
  const res = await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    createDepositPath(sapClient),
    'Deposits.create',
    requestObjectKey,
    {
      debug,
      body: createDepositBody({ hotelId, reservationId, amount, currency }),
    },
  );
  const entity = parseODataEntityJson(res.body) as EmmaDepositRow | null;
  if (!entity || !String(entity.Id ?? '').trim()) {
    throw new Error('EMMA POST Deposits returned no Id');
  }
  const guard = assertDepositMatchesCharge({
    reservationId,
    expectedAmount: amount,
    deposit: entity,
  });
  if (!guard.ok) {
    throw new Error(`MANUAL: ${guard.reason}`);
  }
  log.log(
    `[EMMA] created deposit ${String(entity.Id).trim()} for ${reservationId} amount=${amount} ${currency}`,
  );
  return entity;
}

/**
 * Charge Folio 2 via EMMA deposit (CollectPaymWoInv) — never CreateInvoice.
 */
export async function settleEmmaFolioDepositWithVcc(
  jar: EmmaCookieJar,
  baseUrl: string,
  opts: {
    hotelId: string;
    reservationId: string;
    folioId: string;
    amount: string;
    currency: string;
    employee: string;
    holder?: string;
    sapClient?: string;
    debug?: EmmaSyncDebug;
  },
): Promise<EmmaVccPaymentOutcome> {
  const expectedAmount = opts.amount.trim();
  const hotelId = opts.hotelId.trim();
  const reservationId = opts.reservationId.trim();
  const folioId = opts.folioId.trim();
  const sapClient = opts.sapClient?.trim() || EMMA_DEFAULT_SAP_CLIENT;
  const currency = opts.currency.trim() || 'CHF';
  const requestObjectKey = buildEmmaRequestObjectKey(hotelId, reservationId);

  const allCards = await fetchEmmaReservationCreditCardsFromJar(jar, baseUrl, {
    hotelId,
    reservationId,
    sapClient,
    debug: opts.debug,
  });
  const cards = filterCreditCardsForReservation(allCards, reservationId);
  if (cards.length === 0 && allCards.length > 0) {
    return {
      status: 'UNSAFE',
      invoiceNumber: null,
      depositId: null,
      amount: expectedAmount,
      currency,
      cardMask: null,
      expectedAmount,
      message:
        'Keine VCC mit passender ReservaId gefunden – Zahlung aus Sicherheitsgründen abgebrochen.',
    };
  }

  const selection: VccSelection = selectChargeableVcc(cards);
  if (selection.kind === 'none') {
    return {
      status: 'NO_VCC',
      invoiceNumber: null,
      depositId: null,
      amount: expectedAmount,
      currency,
      cardMask: null,
      expectedAmount,
      message: 'Keine virtuelle Kreditkarte (VCC) mit Token gefunden.',
    };
  }
  if (selection.kind === 'ambiguous') {
    return {
      status: 'AMBIGUOUS',
      invoiceNumber: null,
      depositId: null,
      amount: expectedAmount,
      currency,
      cardMask: null,
      expectedAmount,
      message: `Mehrere VCC (${selection.count}) hinterlegt – manuelle Auswahl nötig.`,
    };
  }

  const card = selection.card;
  const matchedRow = cards.find((c) => String(c.Token ?? '').trim() === card.token);
  const rawCardReservaId = String(
    matchedRow?.ReservaId ?? matchedRow?.ReservationId ?? '',
  ).trim();
  if (!rawCardReservaId || rawCardReservaId !== reservationId) {
    return {
      status: 'UNSAFE',
      invoiceNumber: null,
      depositId: null,
      amount: expectedAmount,
      currency,
      cardMask: card.mask,
      expectedAmount,
      message: `VCC ohne passende ReservaId (Karte=${rawCardReservaId || '—'}, Reservierung=${reservationId}) – Zahlung abgebrochen.`,
    };
  }

  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
  const existing = await fetchDeposits(
    jar,
    baseUrl,
    sapClient,
    csrf,
    hotelId,
    reservationId,
    opts.debug,
  );
  const pick = pickDepositForFolio2Amount(existing, reservationId, expectedAmount);

  if (pick.kind === 'already_paid') {
    log.log(
      `[EMMA] deposit ${pick.id} already paid ${expectedAmount} ${currency} on ${reservationId} — skip charge`,
    );
    return {
      status: 'PAID',
      invoiceNumber: null,
      depositId: pick.id,
      amount: expectedAmount,
      currency,
      cardMask: card.mask,
      expectedAmount,
      message: null,
    };
  }

  let depositId = pick.kind === 'reuse' ? pick.id : '';
  if (pick.kind === 'create') {
    const created = await createDeposit(
      jar,
      baseUrl,
      sapClient,
      csrf,
      hotelId,
      reservationId,
      expectedAmount,
      currency,
      requestObjectKey,
      opts.debug,
    );
    depositId = String(created.Id).trim();
  } else {
    const reused = findDepositById(existing, depositId);
    const guard = reused
      ? assertDepositMatchesCharge({
          reservationId,
          expectedAmount,
          deposit: reused,
          expectedId: depositId,
        })
      : { ok: false as const, reason: `Offenes Deposit ${depositId} nicht gefunden.` };
    if (!guard.ok) {
      return {
        status: 'UNSAFE',
        invoiceNumber: null,
        depositId: null,
        amount: expectedAmount,
        currency,
        cardMask: card.mask,
        expectedAmount,
        message: guard.reason,
      };
    }
    log.log(
      `[EMMA] reusing open deposit ${depositId} for ${reservationId} amount=${expectedAmount} ${currency}`,
    );
  }

  try {
    const tillRes = await postChangesetAction(
      jar,
      baseUrl,
      sapClient,
      csrf,
      getEmployeeTillIdPath({ sapClient, hotelId, employee: opts.employee }),
      'GetEmployeeTillID',
      requestObjectKey,
      { debug: opts.debug },
    );
    const tillId = String(parseODataEntityJson(tillRes.body)?.TillId ?? '').trim();
    if (!tillId) {
      throw new Error('EMMA GetEmployeeTillID returned no TillId for operator');
    }

    await postChangesetAction(
      jar,
      baseUrl,
      sapClient,
      csrf,
      roundDepositPath({
        sapClient,
        hotelId,
        paymentMethod: EMMA_PAYMENT_METHOD_TOKEN,
        amount: expectedAmount,
        currency,
        holder: opts.holder,
      }),
      'Round.deposit',
      requestObjectKey,
      { debug: opts.debug },
    );

    log.log(
      `[EMMA-VCC-AUDIT] deposit CollectPaymWoInv reservation=${reservationId} folio=${folioId} ` +
        `amount=${expectedAmount} ${currency} depositId=${depositId} cardMask=${card.mask ?? '—'} ` +
        `tokenSuffix=${tokenSuffix(card.token)}`,
    );

    const collectRes = await postChangesetAction(
      jar,
      baseUrl,
      sapClient,
      csrf,
      collectPaymWoInvPath({
        sapClient,
        hotelId,
        reservationId,
        depositId,
        tillId,
        employee: opts.employee,
        folioId,
        token: card.token,
        expiry: card.expiry,
      }),
      'CollectPaymWoInv',
      requestObjectKey,
      { allowError: true, debug: opts.debug },
    );
    const collectError = extractODataErrorMessage(collectRes.body);
    if (collectRes.status < 200 || collectRes.status >= 300 || collectError) {
      log.warn(
        `[EMMA] CollectPaymWoInv declined ${reservationId} deposit ${depositId} (HTTP ${collectRes.status}): ${collectError ?? 'unknown'}`,
      );
      return {
        status: 'DECLINED',
        invoiceNumber: null,
        depositId,
        amount: expectedAmount,
        currency,
        cardMask: card.mask,
        expectedAmount,
        message: collectError ?? `EMMA CollectPaymWoInv HTTP ${collectRes.status}`,
      };
    }

    const after = await fetchDeposits(
      jar,
      baseUrl,
      sapClient,
      csrf,
      hotelId,
      reservationId,
      opts.debug,
    );
    const paid = findDepositById(after, depositId);
    if (!paid) {
      throw new Error(`MANUAL: Deposit ${depositId} nach Zahlung nicht mehr in EMMA gefunden.`);
    }
    const match = assertDepositMatchesCharge({
      reservationId,
      expectedAmount,
      deposit: paid,
      expectedId: depositId,
    });
    if (!match.ok) {
      throw new Error(`MANUAL: ${match.reason}`);
    }
    if (!amountsMatch(String(paid.AmountReceived ?? ''), expectedAmount)) {
      throw new Error(
        `MANUAL: Deposit ${depositId} AmountReceived=${String(paid.AmountReceived ?? '—')} ` +
          `erwartet ${expectedAmount} – Zahlung manuell prüfen.`,
      );
    }

    log.log(
      `[EMMA] VCC deposit OK ${reservationId} folio ${folioId} ${expectedAmount} ${currency} (deposit ${depositId})`,
    );
    return {
      status: 'PAID',
      invoiceNumber: null,
      depositId,
      amount: expectedAmount,
      currency,
      cardMask: card.mask,
      expectedAmount,
      message: null,
    };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.startsWith('MANUAL:')) {
      return {
        status: 'UNSAFE',
        invoiceNumber: null,
        depositId,
        amount: expectedAmount,
        currency,
        cardMask: card.mask,
        expectedAmount,
        message: raw.slice('MANUAL:'.length).trim(),
      };
    }
    throw err;
  }
}
