import type {
  ReservationEmmaDetailBundle,
  ReservationEmmaFolioBundle,
} from './reservations';
import { rehydrateFolioBundle } from './folio-charges';

export type OutstandingBalanceSource = 'folio' | 'detail' | 'list' | null;

export type ResolvedOutstandingBalance = {
  balance: string | null;
  source: OutstandingBalanceSource;
};

/** Parse EMMA numeric strings (e.g. "380.480000", "240,50"). */
export function parseEmmaAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function formatOutstandingAmount(amount: number, currency?: string | null): string {
  const formatted = new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  const cur = currency?.trim();
  return cur ? `${formatted} ${cur}` : formatted;
}

function reservationScalarOutstanding(
  reservation: Record<string, unknown>,
): number | null {
  for (const key of [
    'TotalAmountDueFolios',
    'TotalAmountFolios',
    'Balance',
    'AmountDue',
    'OpenBalance',
  ]) {
    const n = parseEmmaAmount(reservation[key]);
    if (n != null) return n;
  }
  return null;
}

function sumFolioHeaderAmountDue(
  folios: Record<string, unknown>[],
): { sum: number; currency: string | null } | null {
  let sum = 0;
  let currency: string | null = null;
  let any = false;
  for (const folio of folios) {
    const due = parseEmmaAmount(folio.AmountDue);
    if (due == null) continue;
    any = true;
    sum += due;
    const cur = String(folio.Currency ?? '').trim();
    if (!currency && cur) currency = cur;
  }
  return any ? { sum, currency } : null;
}

function normalizeStoredBalance(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const n = parseEmmaAmount(raw);
  if (n != null) return formatOutstandingAmount(n);
  return raw;
}

/** Outstanding balance from stored EMMA Folio Management snapshot. */
export function outstandingFromFolio(
  folio: ReservationEmmaFolioBundle | null | undefined,
): string | null {
  if (!folio) return null;
  const bundle = rehydrateFolioBundle(folio);
  const reservation = bundle.reservation;
  const currency = String(reservation.Currency ?? '').trim() || null;

  const scalar = reservationScalarOutstanding(reservation);
  if (scalar != null) return formatOutstandingAmount(scalar, currency);

  const summed = sumFolioHeaderAmountDue(bundle.folios);
  if (summed) {
    return formatOutstandingAmount(summed.sum, summed.currency ?? currency);
  }

  if (bundle.amount && typeof bundle.amount === 'object') {
    const amount = bundle.amount as Record<string, unknown>;
    const total = parseEmmaAmount(amount.Total ?? amount.AmountDue ?? amount.Due);
    if (total != null) return formatOutstandingAmount(total, currency);
  }

  return null;
}

/** Outstanding balance from stored EMMA reservation detail snapshot. */
export function outstandingFromDetail(
  detail: ReservationEmmaDetailBundle | null | undefined,
): string | null {
  if (!detail) return null;
  const reservation = detail.reservation;
  const currency = String(reservation.Currency ?? '').trim() || null;
  const scalar = reservationScalarOutstanding(reservation);
  if (scalar != null) return formatOutstandingAmount(scalar, currency);
  return null;
}

/** Prefer folio (arrival-check) → detail → list-sync sensitive payload. */
export function resolveOutstandingBalance(input: {
  sensitiveBalance?: string | null;
  folio?: ReservationEmmaFolioBundle | null;
  detail?: ReservationEmmaDetailBundle | null;
}): ResolvedOutstandingBalance {
  const fromFolio = outstandingFromFolio(input.folio);
  if (fromFolio) return { balance: fromFolio, source: 'folio' };

  const fromDetail = outstandingFromDetail(input.detail);
  if (fromDetail) return { balance: fromDetail, source: 'detail' };

  const fromList = normalizeStoredBalance(input.sensitiveBalance);
  if (fromList) return { balance: fromList, source: 'list' };

  return { balance: null, source: null };
}

export function outstandingBalanceFetchedAt(input: {
  source: OutstandingBalanceSource;
  folioFetchedAt: Date | string | null | undefined;
  detailFetchedAt: Date | string | null | undefined;
  syncedAt: Date | string;
}): string {
  if (input.source === 'folio' && input.folioFetchedAt) {
    return typeof input.folioFetchedAt === 'string'
      ? input.folioFetchedAt
      : input.folioFetchedAt.toISOString();
  }
  if (input.source === 'detail' && input.detailFetchedAt) {
    return typeof input.detailFetchedAt === 'string'
      ? input.detailFetchedAt
      : input.detailFetchedAt.toISOString();
  }
  return typeof input.syncedAt === 'string' ? input.syncedAt : input.syncedAt.toISOString();
}

/** Plain numeric string for persisting into sensitiveEnc (no currency suffix). */
export function outstandingBalanceForStorage(
  input: Parameters<typeof resolveOutstandingBalance>[0],
): string | null {
  const resolved = resolveOutstandingBalance(input);
  if (!resolved.balance) return null;
  const n = parseEmmaAmount(resolved.balance);
  return n != null ? String(n) : resolved.balance;
}
