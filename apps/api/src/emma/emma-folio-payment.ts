import { Logger } from '@nestjs/common';
import { normalizeFolioId } from '@housekeeping/shared';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
import {
  assertPaymentContextSafe,
  canReuseInvoice,
  filterCreditCardsForReservation,
} from '../arrival-check/arrival-check-payment-guard';
import { clearStaleEmmaFolioPostBlock } from './emma-folio-edit-session';
import {
  buildEmmaRequestObjectKey,
  buildODataBatchBody,
  buildODataChangesetBatchBody,
  createInvoicePath,
  EMMA_DEFAULT_SAP_CLIENT,
  EMMA_ODATA_RSRVS_SRV,
  EMMA_PAYMENT_METHOD_TOKEN,
  extractODataErrorMessage,
  getEmployeeTillIdPath,
  invoiceEntityPath,
  invoiceNumberFromSapMessage,
  parseODataBatchResponse,
  parseODataEntityJson,
  parseODataResultsJson,
  paymentGatewayPath,
  reservationCreditCardsPath,
  reservationInvoicesPath,
  roundInvoicePath,
  setActivityTimePath,
  showInvoicePopupPath,
} from './emma-odata-client';
import {
  selectChargeableVcc,
  type EmmaCreditCardRow,
  type VccSelection,
} from '../arrival-check/arrival-check-vcc';

const log = new Logger('EmmaFolioPayment');

export type EmmaVccChargeParams = {
  hotelId: string;
  reservationId: string;
  folioId: string;
  /** Expected amount to charge, formatted to 2 decimals (e.g. "120.50"). */
  amount: string;
  currency: string;
  employee: string;
  token: string;
  expiry: string;
  cardMask: string | null;
  cardReservaId: string | null;
  sapClient?: string;
  debug?: EmmaSyncDebug;
};

export type EmmaVccChargeResult = {
  ok: boolean;
  invoiceNumber: string | null;
  amount: string;
  currency: string;
  message: string | null;
};

/** Outcome of an arrival-check VCC settlement (business result, not an exception). */
export type EmmaVccPaymentOutcome = {
  status: 'PAID' | 'DECLINED' | 'NO_VCC' | 'AMBIGUOUS' | 'UNSAFE';
  invoiceNumber: string | null;
  amount: string | null;
  currency: string | null;
  cardMask: string | null;
  expectedAmount: string | null;
  message: string | null;
};

async function postChangesetAction(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  actionPath: string,
  label: string,
  requestObjectKey: string,
  opts: { allowError?: boolean; debug?: EmmaSyncDebug } = {},
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const { body, contentType } = buildODataChangesetBatchBody([{ actionPath }], csrf, {
    requestObjectKey,
  });
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

type ReusableInvoice = { invoiceNumber: string; amount: string };

function parseAmountStr(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function fetchInvoiceEntity(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  hotelId: string,
  invoiceNumber: string,
  debug?: EmmaSyncDebug,
): Promise<Record<string, unknown> | null> {
  const path = invoiceEntityPath(hotelId, invoiceNumber, sapClient);
  const { body, contentType } = buildODataBatchBody([{ path }], csrf);
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrf,
    body,
    contentType,
    { label: `invoice.${invoiceNumber}`, debug },
  );
  const parts = parseODataBatchResponse(raw);
  const part = parts[0];
  if (!part || part.status < 200 || part.status >= 300) return null;
  return parseODataEntityJson(part.body);
}

/**
 * Find an already-created but unpaid invoice for a folio when the amount matches
 * the expected charge exactly. Returns 'multiple' when several candidates exist.
 */
async function findReusableInvoice(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  opts: {
    hotelId: string;
    reservationId: string;
    folioId: string;
    expectedAmount: string;
    debug?: EmmaSyncDebug;
  },
): Promise<ReusableInvoice | 'multiple' | 'amount_mismatch' | null> {
  const path = reservationInvoicesPath(opts.hotelId, opts.reservationId, sapClient);
  const { body, contentType } = buildODataBatchBody([{ path }], csrf);
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrf,
    body,
    contentType,
    { label: `invoices.${opts.reservationId}`, debug: opts.debug },
  );
  const parts = parseODataBatchResponse(raw);
  const part = parts[0];
  if (!part || part.status < 200 || part.status >= 300) return null;

  const target = normalizeFolioId(opts.folioId);
  const open: ReusableInvoice[] = [];
  let mismatch = false;
  for (const row of parseODataResultsJson(part.body)) {
    if (normalizeFolioId(row.FolioId) !== target) continue;
    const invoiceNumber = String(row.InvoiceNumber ?? '').trim();
    if (!invoiceNumber) continue;
    if (
      canReuseInvoice(row, {
        reservationId: opts.reservationId,
        folioId: opts.folioId,
        expectedAmount: opts.expectedAmount,
      })
    ) {
      const payable = parseAmountStr(row.TotalPay) ?? parseAmountStr(row.Total);
      open.push({ invoiceNumber, amount: payable!.toFixed(2) });
      continue;
    }
    const rowRes = String(row.ReservationId ?? '').trim();
    if (rowRes === opts.reservationId.trim()) {
      const status = String(row.Status ?? '').trim();
      if (!/paid|cancel|storn|annul/i.test(status)) mismatch = true;
    }
  }
  if (open.length === 0) {
    return mismatch ? 'amount_mismatch' : null;
  }
  if (open.length > 1) return 'multiple';
  return open[0];
}

/** Fetch the reservation's credit cards (incl. Token) — kept transient, never persisted. */
export async function fetchEmmaReservationCreditCardsFromJar(
  jar: EmmaCookieJar,
  baseUrl: string,
  opts: { hotelId: string; reservationId: string; sapClient?: string; debug?: EmmaSyncDebug },
): Promise<EmmaCreditCardRow[]> {
  const sapClient = opts.sapClient?.trim() || EMMA_DEFAULT_SAP_CLIENT;
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);
  const path = reservationCreditCardsPath(opts.hotelId, opts.reservationId, sapClient);
  const { body, contentType } = buildODataBatchBody([{ path, checkInApp: true }], csrf);
  const raw = await emmaHttpPostBatch(
    jar,
    baseUrl,
    EMMA_ODATA_RSRVS_SRV,
    sapClient,
    csrf,
    body,
    contentType,
    { label: `creditcards.${opts.reservationId}`, debug: opts.debug, tmsFioriApp: 'CheckIn' },
  );
  const parts = parseODataBatchResponse(raw);
  const part = parts[0];
  if (!part || part.status < 200 || part.status >= 300) {
    throw new Error(`EMMA CreditCards fetch failed (HTTP ${part?.status ?? 'missing'})`);
  }
  return parseODataResultsJson(part.body) as EmmaCreditCardRow[];
}

function tokenSuffix(token: string): string {
  const t = token.trim();
  return t.length >= 4 ? t.slice(-4) : '????';
}

function isEmmaReservationBlockedError(message: string): boolean {
  return /blocked/i.test(message);
}

async function createInvoiceOrThrow(
  jar: EmmaCookieJar,
  baseUrl: string,
  sapClient: string,
  csrf: string,
  hotelId: string,
  reservationId: string,
  folioId: string,
  employee: string,
  requestObjectKey: string,
  debug?: EmmaSyncDebug,
): Promise<string> {
  const runCreate = async () => {
    const invoiceRes = await postChangesetAction(
      jar,
      baseUrl,
      sapClient,
      csrf,
      createInvoicePath({ sapClient, hotelId, reservationId, folioId }),
      'CreateInvoice',
      requestObjectKey,
      { debug },
    );
    const invoiceNumber =
      invoiceNumberFromSapMessage(invoiceRes.headers) ??
      String(parseODataEntityJson(invoiceRes.body)?.InvoiceNumber ?? '').trim();
    if (!invoiceNumber) {
      throw new Error('EMMA CreateInvoice returned no InvoiceNumber (sap-message header missing)');
    }
    return invoiceNumber;
  };

  try {
    return await runCreate();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isEmmaReservationBlockedError(message)) throw err;
    log.warn(
      `[EMMA] CreateInvoice blocked for ${reservationId} — clearing stale folio draft and retrying`,
    );
    await clearStaleEmmaFolioPostBlock(
      jar,
      baseUrl,
      hotelId,
      reservationId,
      employee,
      sapClient,
      debug,
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
    return runCreate();
  }
}

/**
 * Charge a stored VCC token against a folio invoice.
 * Flow (payment HAR): showInvoicePopup → SetActivityTime(03) → GetEmployeeTillID →
 * CreateInvoice → Round(PG3) → SetActivityTime(04) → PaymentGateway(PG3, Token).
 */
export async function chargeEmmaFolioWithVccToken(
  jar: EmmaCookieJar,
  baseUrl: string,
  opts: EmmaVccChargeParams,
): Promise<EmmaVccChargeResult> {
  const hotelId = opts.hotelId.trim();
  const reservationId = opts.reservationId.trim();
  const folioId = opts.folioId.trim().padStart(2, '0');
  const sapClient = opts.sapClient?.trim() || EMMA_DEFAULT_SAP_CLIENT;
  const employee = opts.employee.trim();
  const token = opts.token.trim();
  const expiry = opts.expiry.trim();
  const currency = opts.currency.trim() || 'CHF';
  const expectedAmount = opts.amount.trim();

  if (!hotelId || !reservationId || !folioId) {
    throw new Error('hotelId, reservationId and folioId required for VCC charge');
  }
  if (!token) {
    throw new Error('VCC token required for charge (refusing to charge without a token)');
  }

  const requestObjectKey = buildEmmaRequestObjectKey(hotelId, reservationId);
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);

  await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    showInvoicePopupPath({ sapClient, hotelId, reservationId, folioId }),
    'showInvoicePopup',
    requestObjectKey,
    { debug: opts.debug },
  );

  await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    setActivityTimePath({ sapClient, hotelId, reservationId, subAction: '03' }),
    'SetActivityTime(03)',
    requestObjectKey,
    { debug: opts.debug },
  );

  const tillRes = await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    getEmployeeTillIdPath({ sapClient, hotelId, employee }),
    'GetEmployeeTillID',
    requestObjectKey,
    { debug: opts.debug },
  );
  const tillEntity = parseODataEntityJson(tillRes.body);
  const tillId = String(tillEntity?.TillId ?? '').trim();
  if (!tillId) {
    throw new Error('EMMA GetEmployeeTillID returned no TillId for operator');
  }

  const reusable = await findReusableInvoice(jar, baseUrl, sapClient, csrf, {
    hotelId,
    reservationId,
    folioId,
    expectedAmount,
    debug: opts.debug,
  });
  if (reusable === 'multiple') {
    throw new Error(
      `MANUAL: Mehrere offene Rechnungen auf Folio ${folioId} – VCC-Zahlung manuell prüfen.`,
    );
  }
  if (reusable === 'amount_mismatch') {
    throw new Error(
      `MANUAL: Offene Rechnung auf Folio ${folioId} mit abweichendem Betrag – manuell prüfen.`,
    );
  }

  let invoiceNumber: string;
  const chargeAmount = expectedAmount;
  if (reusable) {
    invoiceNumber = reusable.invoiceNumber;
    log.log(
      `[EMMA] reusing open invoice ${invoiceNumber} on ${reservationId} folio ${folioId} (${chargeAmount} ${currency})`,
    );
  } else {
    invoiceNumber = await createInvoiceOrThrow(
      jar,
      baseUrl,
      sapClient,
      csrf,
      hotelId,
      reservationId,
      folioId,
      employee,
      requestObjectKey,
      opts.debug,
    );
  }

  const invoiceEntity = await fetchInvoiceEntity(
    jar,
    baseUrl,
    sapClient,
    csrf,
    hotelId,
    invoiceNumber,
    opts.debug,
  );
  // We REQUIRE the invoice entity to be readable; if we can't read it back we
  // cannot validate the reservation/folio/amount tying — refuse to charge.
  if (!invoiceEntity) {
    throw new Error(
      `MANUAL: Rechnung ${invoiceNumber} konnte nicht aus EMMA gelesen werden – Zahlung abgebrochen.`,
    );
  }
  const guard = assertPaymentContextSafe({
    reservationId,
    folioId,
    expectedAmount: chargeAmount,
    card: { token, mask: opts.cardMask, reservaId: opts.cardReservaId },
    invoice: invoiceEntity,
  });
  if (!guard.ok) {
    throw new Error(`MANUAL: ${guard.reason}`);
  }

  await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    roundInvoicePath({
      sapClient,
      hotelId,
      invoiceNumber,
      paymentMethod: EMMA_PAYMENT_METHOD_TOKEN,
      amount: chargeAmount,
      currency,
    }),
    'Round',
    requestObjectKey,
    { debug: opts.debug },
  );

  await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    setActivityTimePath({ sapClient, hotelId, reservationId, subAction: '04' }),
    'SetActivityTime(04)',
    requestObjectKey,
    { debug: opts.debug },
  );

  log.log(
    `[EMMA-VCC-AUDIT] reservation=${reservationId} folio=${folioId} amount=${chargeAmount} ${currency} invoice=${invoiceNumber} cardMask=${opts.cardMask ?? '—'} tokenSuffix=${tokenSuffix(token)} requestObjectKey=${requestObjectKey}`,
  );

  const gatewayRes = await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    paymentGatewayPath({
      sapClient,
      hotelId,
      reservationId,
      invoiceNumber,
      folioId,
      employee,
      token,
      expiry,
      amount: chargeAmount,
      currency,
      tillId,
      paymentMethod: EMMA_PAYMENT_METHOD_TOKEN,
    }),
    'PaymentGateway',
    requestObjectKey,
    { allowError: true, debug: opts.debug },
  );

  const errorMessage = extractODataErrorMessage(gatewayRes.body);
  const ok = gatewayRes.status >= 200 && gatewayRes.status < 300 && !errorMessage;
  if (ok) {
    log.log(
      `[EMMA] VCC charge OK ${reservationId} folio ${folioId} ${chargeAmount} ${currency} (invoice ${invoiceNumber})`,
    );
  } else {
    log.warn(
      `[EMMA] VCC charge declined ${reservationId} folio ${folioId} (HTTP ${gatewayRes.status}): ${errorMessage ?? 'unknown'}`,
    );
  }

  return {
    ok,
    invoiceNumber,
    amount: chargeAmount,
    currency,
    message: ok ? null : (errorMessage ?? `EMMA PaymentGateway HTTP ${gatewayRes.status}`),
  };
}

/**
 * Select the chargeable VCC for the reservation and settle the folio.
 * Safety: ReservaId filter, invoice validation, and audit log before any charge.
 */
export async function settleEmmaFolioWithVcc(
  jar: EmmaCookieJar,
  baseUrl: string,
  opts: {
    hotelId: string;
    reservationId: string;
    folioId: string;
    amount: string;
    currency: string;
    employee: string;
    sapClient?: string;
    debug?: EmmaSyncDebug;
  },
): Promise<EmmaVccPaymentOutcome> {
  const expectedAmount = opts.amount.trim();
  const allCards = await fetchEmmaReservationCreditCardsFromJar(jar, baseUrl, {
    hotelId: opts.hotelId,
    reservationId: opts.reservationId,
    sapClient: opts.sapClient,
    debug: opts.debug,
  });

  const cards = filterCreditCardsForReservation(allCards, opts.reservationId);
  if (cards.length === 0 && allCards.length > 0) {
    return {
      status: 'UNSAFE',
      invoiceNumber: null,
      amount: expectedAmount,
      currency: opts.currency,
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
      amount: expectedAmount,
      currency: opts.currency,
      cardMask: null,
      expectedAmount,
      message: 'Keine virtuelle Kreditkarte (VCC) mit Token gefunden.',
    };
  }
  if (selection.kind === 'ambiguous') {
    return {
      status: 'AMBIGUOUS',
      invoiceNumber: null,
      amount: expectedAmount,
      currency: opts.currency,
      cardMask: null,
      expectedAmount,
      message: `Mehrere VCC (${selection.count}) hinterlegt – manuelle Auswahl nötig.`,
    };
  }

  const card = selection.card;
  const matchedRow = cards.find((c) => String(c.Token ?? '').trim() === card.token);
  // Hard requirement: the EMMA CreditCard row must expose an explicit ReservaId
  // tying it to the reservation we are charging. No fallback to the call argument —
  // that would defeat the whole guard (cardReservaId === reservationId trivially).
  const rawCardReservaId = String(
    matchedRow?.ReservaId ?? matchedRow?.ReservationId ?? '',
  ).trim();
  if (!rawCardReservaId || rawCardReservaId !== opts.reservationId.trim()) {
    return {
      status: 'UNSAFE',
      invoiceNumber: null,
      amount: expectedAmount,
      currency: opts.currency,
      cardMask: card.mask,
      expectedAmount,
      message: `VCC ohne passende ReservaId (Karte=${rawCardReservaId || '—'}, Reservierung=${opts.reservationId}) – Zahlung abgebrochen.`,
    };
  }
  const cardReservaId = rawCardReservaId;

  try {
    const charge = await chargeEmmaFolioWithVccToken(jar, baseUrl, {
      hotelId: opts.hotelId,
      reservationId: opts.reservationId,
      folioId: opts.folioId,
      amount: expectedAmount,
      currency: opts.currency,
      employee: opts.employee,
      token: card.token,
      expiry: card.expiry,
      cardMask: card.mask,
      cardReservaId,
      sapClient: opts.sapClient,
      debug: opts.debug,
    });

    return {
      status: charge.ok ? 'PAID' : 'DECLINED',
      invoiceNumber: charge.invoiceNumber,
      amount: charge.amount,
      currency: charge.currency,
      cardMask: card.mask,
      expectedAmount,
      message: charge.message,
    };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.startsWith('MANUAL:')) {
      return {
        status: 'UNSAFE',
        invoiceNumber: null,
        amount: expectedAmount,
        currency: opts.currency,
        cardMask: card.mask,
        expectedAmount,
        message: raw.slice('MANUAL:'.length).trim(),
      };
    }
    throw err;
  }
}
