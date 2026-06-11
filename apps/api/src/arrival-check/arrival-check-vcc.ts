import type {
  ReservationEmmaDetailBundle,
  ReservationEmmaFolioBundle,
  ReservationFolioCharge,
} from '@housekeeping/shared';
import { normalizeFolioId } from '@housekeeping/shared';
import { findCompanyFolioId } from './arrival-check-charge-assign';
import type { ArrivalCheckDecision } from './arrival-check-rules';

const GUEST_FOLIO_ID = '01';

/**
 * Holder-name keywords that identify an OTA-provided virtual card.
 * EMMA's `IsVCC` flag is the primary signal; these names are the fallback
 * (Booking, Expedia, Agoda and CTrip all stamp recognizable holder names).
 */
export const VCC_HOLDER_RX =
  /bookingcom|booking\.com|virtual\s*card|\bvcc\b|expedia\s*virtual|\bagoda\b|\bctrip\b|trip\.com/i;

/** Raw EMMA CreditCard row (ZEYUI_RSRVS_SRV CreditCard entity). */
export type EmmaCreditCardRow = {
  Token?: unknown;
  Expiry?: unknown;
  Holder?: unknown;
  Mask?: unknown;
  Type?: unknown;
  TypeDesc?: unknown;
  IsVCC?: unknown;
  GatewayBrand?: unknown;
  [key: string]: unknown;
};

/** A virtual card that can be charged (token resolved). */
export type ChargeableVcc = {
  token: string;
  expiry: string;
  holder: string | null;
  mask: string | null;
};

export type VccSelection =
  | { kind: 'ok'; card: ChargeableVcc }
  | { kind: 'none' }
  | { kind: 'ambiguous'; count: number };

export type VccPaymentPlan = {
  /** Folio to settle (company folio for OTA, guest folio 01 for CTrip). */
  folioId: string;
  /** Amount to charge, formatted to 2 decimals (e.g. "120.50"). */
  amount: string;
  /** ISO currency (defaults to CHF). */
  currency: string;
};

function isTruthy(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    return s === 'true' || s === 'x' || s === '1' || s === 'yes';
  }
  return value === 1;
}

function str(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value).trim() || null;
}

function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Virtual credit card: EMMA IsVCC flag (primary) or holder-name keyword (fallback). */
export function isVccCard(card: EmmaCreditCardRow): boolean {
  if (isTruthy(card.IsVCC)) return true;
  const holder = String(card.Holder ?? '').trim();
  return Boolean(holder && VCC_HOLDER_RX.test(holder));
}

/**
 * Choose the single chargeable VCC for a reservation.
 * Returns `ambiguous` when several distinct VCC tokens exist (manual intervention),
 * and `none` when there is no VCC with a usable token. Personal cards are never
 * returned, so a charge can only ever target a virtual card.
 */
export function selectChargeableVcc(cards: EmmaCreditCardRow[]): VccSelection {
  const withToken = cards
    .filter(isVccCard)
    .map((c) => ({
      token: String(c.Token ?? '').trim(),
      expiry: String(c.Expiry ?? '').trim(),
      holder: str(c.Holder),
      mask: str(c.Mask),
    }))
    .filter((c) => c.token.length > 0);

  const uniqueTokens = [...new Set(withToken.map((c) => c.token))];
  if (uniqueTokens.length === 0) return { kind: 'none' };
  if (uniqueTokens.length > 1) return { kind: 'ambiguous', count: uniqueTokens.length };
  const card = withToken.find((c) => c.token === uniqueTokens[0])!;
  return { kind: 'ok', card };
}

function folioCharges(
  folio: ReservationEmmaFolioBundle,
  folioId: string,
): ReservationFolioCharge[] {
  const fid = normalizeFolioId(folioId);
  if (folio.chargesByFolio && Object.prototype.hasOwnProperty.call(folio.chargesByFolio, fid)) {
    return folio.chargesByFolio[fid];
  }
  return (folio.charges ?? []).filter((c) => normalizeFolioId(c.folioId) === fid);
}

/** Outstanding balance of a folio = sum of its visible charge amounts. */
function folioBalance(
  folio: ReservationEmmaFolioBundle,
  folioId: string,
): { amount: number; currency: string | null } {
  let total = 0;
  let currency: string | null = null;
  for (const charge of folioCharges(folio, folioId)) {
    const n = parseAmount(charge.amount);
    if (n != null) total += n;
    if (!currency && charge.currency) currency = charge.currency;
  }
  return { amount: Math.round(total * 100) / 100, currency };
}

/**
 * Decide whether (and what) to charge on the VCC after charges are routed:
 * - OTA (Booking/Expedia/Agoda) + VCC: settle the company folio (room/board).
 * - CTrip + VCC: settle the guest folio 01 (all costs).
 * - Everything else (Radisson direct, prepaid, flexible, personal card): no charge.
 * Returns null when no charge applies or the folio balance is not positive.
 */
export function planVccPayment(input: {
  decision: ArrivalCheckDecision;
  detail: ReservationEmmaDetailBundle | null;
  folio: ReservationEmmaFolioBundle;
}): VccPaymentPlan | null {
  const { decision, folio } = input;

  let folioId: string | null = null;
  if (
    (decision.source === 'BOOKING' ||
      decision.source === 'EXPEDIA' ||
      decision.source === 'AGODA') &&
    decision.scenario === 'VCC'
  ) {
    folioId = findCompanyFolioId(folio.folios ?? []);
  } else if (decision.source === 'CTRIP' && decision.vcc) {
    folioId = GUEST_FOLIO_ID;
  }

  if (!folioId) return null;
  const { amount, currency } = folioBalance(folio, folioId);
  if (amount <= 0) return null;

  return {
    folioId: normalizeFolioId(folioId),
    amount: amount.toFixed(2),
    currency: currency ?? 'CHF',
  };
}
