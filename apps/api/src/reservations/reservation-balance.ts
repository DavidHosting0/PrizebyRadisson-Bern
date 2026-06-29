import type {
  ReservationEmmaDetailBundle,
  ReservationEmmaFolioBundle,
} from '@housekeeping/shared';
import type { ReservationSensitivePayload } from './reservation-sensitive';

function strField(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v == null || v === '') continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function numField(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v == null || v === '') continue;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/** Outstanding balance from EMMA Folio Management snapshot. */
export function balanceFromFolio(folio: ReservationEmmaFolioBundle | null | undefined): string | null {
  if (!folio) return null;
  const fromReservation = numField(
    folio.reservation,
    'TotalAmountDueFolios',
    'TotalAmountFolios',
    'Balance',
  );
  if (fromReservation) return fromReservation;

  const amount = folio.amount;
  if (amount && typeof amount === 'object') {
    return numField(amount as Record<string, unknown>, 'Total', 'AmountDue', 'Due');
  }
  return null;
}

/** Outstanding balance from EMMA reservation detail snapshot. */
export function balanceFromDetail(
  detail: ReservationEmmaDetailBundle | null | undefined,
): string | null {
  if (!detail) return null;
  return numField(
    detail.reservation,
    'TotalAmountDueFolios',
    'TotalAmountFolios',
    'Balance',
  );
}

export type ResolvedReservationBalance = {
  balance: string | null;
  source: 'folio' | 'detail' | 'list' | null;
};

/** Prefer folio (arrival-check) over detail over list-sync sensitive payload. */
export function resolveReservationBalance(input: {
  sensitive: ReservationSensitivePayload | null | undefined;
  folio: ReservationEmmaFolioBundle | null | undefined;
  detail: ReservationEmmaDetailBundle | null | undefined;
}): ResolvedReservationBalance {
  const fromFolio = balanceFromFolio(input.folio);
  if (fromFolio) return { balance: fromFolio, source: 'folio' };

  const fromDetail = balanceFromDetail(input.detail);
  if (fromDetail) return { balance: fromDetail, source: 'detail' };

  const fromList = input.sensitive?.balance?.trim() || null;
  if (fromList) return { balance: fromList, source: 'list' };

  return { balance: null, source: null };
}

export function balanceFetchedAt(input: {
  source: ResolvedReservationBalance['source'];
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
