import { Logger } from '@nestjs/common';
import type { EmmaCookieJar } from './emma-cookie-jar';
import { emmaHttpFetchCsrfToken, emmaHttpPostBatch } from './emma-http-auth';
import type { EmmaSyncDebug } from './emma-sync-debug';
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
  parseODataBatchResponse,
  parseODataEntityJson,
  parseODataResultsJson,
  paymentGatewayPath,
  reservationCreditCardsPath,
  roundInvoicePath,
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
  /** Amount to charge, formatted to 2 decimals (e.g. "120.50"). */
  amount: string;
  currency: string;
  /** Operator / employee code (cashier) from EMMA login. */
  employee: string;
  token: string;
  expiry: string;
  sapClient?: string;
  debug?: EmmaSyncDebug;
};

export type EmmaVccChargeResult = {
  /** True only when the gateway confirmed the charge (inner 2xx, no error). */
  ok: boolean;
  invoiceNumber: string | null;
  amount: string;
  currency: string;
  /** Gateway decline / error message when ok=false. */
  message: string | null;
};

/** Outcome of an arrival-check VCC settlement (business result, not an exception). */
export type EmmaVccPaymentOutcome = {
  status: 'PAID' | 'DECLINED' | 'NO_VCC' | 'AMBIGUOUS';
  invoiceNumber: string | null;
  amount: string | null;
  currency: string | null;
  cardMask: string | null;
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
): Promise<{ status: number; body: string }> {
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
  return { status: part.status, body: part.body };
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

/**
 * Charge a stored VCC token against a folio invoice.
 * Mirrors the confirmed EMMA flow (payment2.com.har):
 *   showInvoicePopup -> GetEmployeeTillID -> CreateInvoice -> Round(PG3) -> PaymentGateway(PG3, Token).
 * The outer $batch returns 202 regardless; success/decline is read from the inner part:
 * a 2xx with no `error` object is a confirmed charge, anything else is a decline.
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

  if (!hotelId || !reservationId || !folioId) {
    throw new Error('hotelId, reservationId and folioId required for VCC charge');
  }
  if (!token) {
    throw new Error('VCC token required for charge (refusing to charge without a token)');
  }

  const requestObjectKey = buildEmmaRequestObjectKey(hotelId, reservationId);
  const csrf = await emmaHttpFetchCsrfToken(jar, baseUrl, sapClient, EMMA_ODATA_RSRVS_SRV);

  // 1) Open invoice context for the folio.
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

  // 2) Resolve the operator's till.
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

  // 3) Create the invoice for this folio.
  const invoiceRes = await postChangesetAction(
    jar,
    baseUrl,
    sapClient,
    csrf,
    createInvoicePath({ sapClient, hotelId, reservationId, folioId }),
    'CreateInvoice',
    requestObjectKey,
    { debug: opts.debug },
  );
  const invoiceEntity = parseODataEntityJson(invoiceRes.body);
  const invoiceNumber = String(invoiceEntity?.InvoiceNumber ?? '').trim();
  if (!invoiceNumber) {
    throw new Error('EMMA CreateInvoice returned no InvoiceNumber');
  }

  // 4) Round the invoice for the token payment method.
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
      amount: opts.amount,
      currency,
    }),
    'Round',
    requestObjectKey,
    { debug: opts.debug },
  );

  // 5) Charge the stored VCC token via the payment gateway.
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
      amount: opts.amount,
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
      `[EMMA] VCC charge OK ${reservationId} folio ${folioId} ${opts.amount} ${currency} (invoice ${invoiceNumber})`,
    );
  } else {
    log.warn(
      `[EMMA] VCC charge declined ${reservationId} folio ${folioId} (HTTP ${gatewayRes.status}): ${errorMessage ?? 'unknown'}`,
    );
  }

  return {
    ok,
    invoiceNumber,
    amount: opts.amount,
    currency,
    message: ok ? null : (errorMessage ?? `EMMA PaymentGateway HTTP ${gatewayRes.status}`),
  };
}

/**
 * Select the chargeable VCC for the reservation and settle the folio.
 * Safety: only a card identified as a VCC (IsVCC flag or holder keyword) is ever
 * charged — personal cards are never touched. Multiple VCCs => AMBIGUOUS (manual).
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
  const cards = await fetchEmmaReservationCreditCardsFromJar(jar, baseUrl, {
    hotelId: opts.hotelId,
    reservationId: opts.reservationId,
    sapClient: opts.sapClient,
    debug: opts.debug,
  });

  const selection: VccSelection = selectChargeableVcc(cards);
  if (selection.kind === 'none') {
    return {
      status: 'NO_VCC',
      invoiceNumber: null,
      amount: opts.amount,
      currency: opts.currency,
      cardMask: null,
      message: 'Keine virtuelle Kreditkarte (VCC) mit Token gefunden.',
    };
  }
  if (selection.kind === 'ambiguous') {
    return {
      status: 'AMBIGUOUS',
      invoiceNumber: null,
      amount: opts.amount,
      currency: opts.currency,
      cardMask: null,
      message: `Mehrere VCC (${selection.count}) hinterlegt – manuelle Auswahl nötig.`,
    };
  }

  const card = selection.card;
  const charge = await chargeEmmaFolioWithVccToken(jar, baseUrl, {
    hotelId: opts.hotelId,
    reservationId: opts.reservationId,
    folioId: opts.folioId,
    amount: opts.amount,
    currency: opts.currency,
    employee: opts.employee,
    token: card.token,
    expiry: card.expiry,
    sapClient: opts.sapClient,
    debug: opts.debug,
  });

  return {
    status: charge.ok ? 'PAID' : 'DECLINED',
    invoiceNumber: charge.invoiceNumber,
    amount: charge.amount,
    currency: charge.currency,
    cardMask: card.mask,
    message: charge.message,
  };
}
