import type { ReservationEmmaFolioBundle } from '@housekeeping/shared';
import {
  isArrivalCheckPrepaymentCharge,
  isArrivalCheckRoomBoardConcept,
  normalizeFolioId,
} from '@housekeeping/shared';
import type { ArrivalCheckDecision } from './arrival-check-rules';
import type { EmmaCreditCardRow } from './arrival-check-vcc';

const GUEST_FOLIO_ID = '01';
export const PAYMENT_AMOUNT_TOLERANCE = 0.01;

export type ExpectedVccCharge = {
  amount: number;
  currency: string;
};

export type PaymentGuardFailure = {
  ok: false;
  reason: string;
};

export type PaymentGuardSuccess = {
  ok: true;
};

export type PaymentGuardResult = PaymentGuardFailure | PaymentGuardSuccess;

function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizeReservationId(value: unknown): string {
  return String(value ?? '').trim();
}

/** Compare monetary amounts with a small tolerance (rounding). */
export function amountsMatch(
  a: number | string,
  b: number | string,
  tolerance = PAYMENT_AMOUNT_TOLERANCE,
): boolean {
  const na = typeof a === 'number' ? a : parseAmount(a);
  const nb = typeof b === 'number' ? b : parseAmount(b);
  if (na == null || nb == null) return false;
  const ra = Math.round(na * 100);
  const rb = Math.round(nb * 100);
  const tolCents = Math.round(tolerance * 100);
  return Math.abs(ra - rb) <= tolCents;
}

function folioChargesOnTarget(
  folio: ReservationEmmaFolioBundle,
  folioId: string,
): ReservationEmmaFolioBundle['charges'] {
  const fid = normalizeFolioId(folioId);
  if (folio.chargesByFolio && Object.prototype.hasOwnProperty.call(folio.chargesByFolio, fid)) {
    return folio.chargesByFolio[fid];
  }
  return (folio.charges ?? []).filter((c) => normalizeFolioId(c.folioId) === fid);
}

/**
 * Compute the chargeable VCC amount from visible folio lines (never AmountDue alone).
 * - OTA + VCC: RO/BB on the target folio only.
 * - CTrip + VCC: all non-prepayment charges on Folio 01.
 */
export function computeExpectedVccChargeAmount(
  decision: ArrivalCheckDecision,
  folio: ReservationEmmaFolioBundle,
  folioId: string,
): ExpectedVccCharge | null {
  const fid = normalizeFolioId(folioId);
  const charges = folioChargesOnTarget(folio, fid);
  let total = 0;
  let currency: string | null = null;

  const isCtrip = decision.source === 'CTRIP' && decision.vcc;
  const isOtaVcc =
    (decision.source === 'BOOKING' ||
      decision.source === 'EXPEDIA' ||
      decision.source === 'AGODA') &&
    decision.scenario === 'VCC';

  if (!isCtrip && !isOtaVcc) return null;

  for (const charge of charges) {
    if (isArrivalCheckPrepaymentCharge(charge)) continue;
    if (isOtaVcc && !isArrivalCheckRoomBoardConcept(charge.concept)) continue;
    const n = parseAmount(charge.amount);
    if (n == null) continue;
    total += n;
    if (!currency && charge.currency) currency = charge.currency;
  }

  const amount = Math.round(total * 100) / 100;
  if (amount <= 0) return null;
  return { amount, currency: currency ?? 'CHF' };
}

/** Keep only credit cards explicitly tied to this reservation (ReservaId field). */
export function filterCreditCardsForReservation(
  cards: EmmaCreditCardRow[],
  reservationId: string,
): EmmaCreditCardRow[] {
  const target = normalizeReservationId(reservationId);
  return cards.filter((card) => {
    const reservaId = normalizeReservationId(card.ReservaId ?? card.ReservationId);
    if (!reservaId) return false;
    return reservaId === target;
  });
}

export type InvoiceGuardRow = {
  ReservationId?: unknown;
  FolioId?: unknown;
  Total?: unknown;
  TotalPay?: unknown;
};

/**
 * Hard validation before PaymentGateway — abort (manual) on any mismatch.
 * `card.reservaId` is mandatory: a card without an explicit reservation binding
 * is never trustworthy enough to charge.
 */
export function assertPaymentContextSafe(input: {
  reservationId: string;
  folioId: string;
  expectedAmount: string;
  card: { token: string; mask: string | null; reservaId: string | null };
  invoice: InvoiceGuardRow | null;
}): PaymentGuardResult {
  const reservationId = normalizeReservationId(input.reservationId);
  const folioId = normalizeFolioId(input.folioId);

  const cardReservaId = normalizeReservationId(input.card.reservaId);
  if (!cardReservaId) {
    return {
      ok: false,
      reason: 'VCC ohne ReservaId – Zahlung aus Sicherheitsgründen abgebrochen.',
    };
  }
  if (cardReservaId !== reservationId) {
    return {
      ok: false,
      reason: `VCC gehört zu Reservierung ${cardReservaId}, erwartet ${reservationId}.`,
    };
  }

  if (!input.card.token.trim()) {
    return { ok: false, reason: 'VCC ohne Token — Zahlung abgebrochen.' };
  }
  if (!input.expectedAmount.trim() || parseAmount(input.expectedAmount) == null) {
    return { ok: false, reason: 'Erwarteter Betrag fehlt – Zahlung abgebrochen.' };
  }
  if ((parseAmount(input.expectedAmount) ?? 0) <= 0) {
    return { ok: false, reason: 'Erwarteter Betrag <= 0 – Zahlung abgebrochen.' };
  }

  if (input.invoice) {
    const invRes = normalizeReservationId(input.invoice.ReservationId);
    if (invRes && invRes !== reservationId) {
      return {
        ok: false,
        reason: `Rechnung gehört zu Reservierung ${invRes}, erwartet ${reservationId}.`,
      };
    }
    const invFolio = normalizeFolioId(String(input.invoice.FolioId ?? ''));
    if (invFolio && invFolio !== folioId) {
      return {
        ok: false,
        reason: `Rechnung gehört zu Folio ${invFolio}, erwartet Folio ${folioId}.`,
      };
    }
    const invoiceAmount =
      parseAmount(input.invoice.TotalPay) ?? parseAmount(input.invoice.Total);
    if (invoiceAmount != null && !amountsMatch(invoiceAmount, input.expectedAmount)) {
      return {
        ok: false,
        reason: `Rechnungsbetrag ${invoiceAmount.toFixed(2)} weicht vom erwarteten Betrag ${input.expectedAmount} ab.`,
      };
    }
  }

  return { ok: true };
}

/** Whether an open invoice row may be reused for this charge attempt. */
export function canReuseInvoice(
  row: InvoiceGuardRow & { InvoiceNumber?: unknown; Status?: unknown; TotalPaid?: unknown },
  opts: { reservationId: string; folioId: string; expectedAmount: string },
): boolean {
  const reservationId = normalizeReservationId(opts.reservationId);
  const folioId = normalizeFolioId(opts.folioId);
  const rowRes = normalizeReservationId(row.ReservationId);
  if (rowRes && rowRes !== reservationId) return false;
  if (normalizeFolioId(String(row.FolioId ?? '')) !== folioId) return false;
  const status = String(row.Status ?? '').trim();
  if (/paid|cancel|storn|annul/i.test(status)) return false;
  const paid = parseAmount(row.TotalPaid) ?? 0;
  if (paid > 0) return false;
  const payable = parseAmount(row.TotalPay) ?? parseAmount(row.Total);
  if (payable == null || payable <= 0) return false;
  return amountsMatch(payable, opts.expectedAmount);
}

export { GUEST_FOLIO_ID };
