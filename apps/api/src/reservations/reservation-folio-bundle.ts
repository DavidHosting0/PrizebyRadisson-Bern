import type {
  ReservationEmmaFolioBundle,
  ReservationFolioCharge,
} from '@housekeeping/shared';
import {
  extractFolioChargesFromEmma,
  groupChargesByFolio,
  rehydrateFolioBundle,
} from '@housekeeping/shared';
import type { SecretCipherService } from '../common/crypto/secret-cipher.service';

export type { ReservationEmmaFolioBundle, ReservationFolioCharge };
export { extractFolioChargesFromEmma as extractFolioCharges, rehydrateFolioBundle };

function stripODataRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === '__metadata') continue;
    if (value && typeof value === 'object' && '__deferred' in (value as object)) continue;
    out[key] = value;
  }
  return out;
}

function odataResults(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  const results = (value as { results?: unknown[] }).results;
  if (!Array.isArray(results)) return [];
  return results.filter(
    (r): r is Record<string, unknown> => r != null && typeof r === 'object',
  );
}

export function buildReservationFolioBundle(input: {
  reservation: Record<string, unknown>;
  remarks: Record<string, unknown> | null;
  depositConcepts: Record<string, unknown>[];
  fetchedAt: Date;
}): ReservationEmmaFolioBundle {
  const reservation = stripODataRow(input.reservation);
  const folios = odataResults(reservation.Folios).map(stripODataRow);
  const amountRaw = reservation.Amount;
  const amount =
    amountRaw && typeof amountRaw === 'object' && !('__deferred' in (amountRaw as object))
      ? stripODataRow(amountRaw as Record<string, unknown>)
      : null;
  const mainCustomerRaw = reservation.MainCustomer;
  const mainGuestRaw = reservation.MainGuest;

  const draft: ReservationEmmaFolioBundle = {
    fetchedAt: input.fetchedAt.toISOString(),
    reservation,
    folios,
    charges: [],
    amount,
    mainCustomer:
      mainCustomerRaw &&
      typeof mainCustomerRaw === 'object' &&
      !('__deferred' in (mainCustomerRaw as object))
        ? stripODataRow(mainCustomerRaw as Record<string, unknown>)
        : null,
    mainGuest:
      mainGuestRaw &&
      typeof mainGuestRaw === 'object' &&
      !('__deferred' in (mainGuestRaw as object))
        ? stripODataRow(mainGuestRaw as Record<string, unknown>)
        : null,
    loanedItems: odataResults(reservation.LoanedItems).map(stripODataRow),
    notices: odataResults(reservation.Notices).map(stripODataRow),
    messages: odataResults(reservation.Messages).map(stripODataRow),
    remarks: input.remarks ? stripODataRow(input.remarks) : null,
    depositConcepts: input.depositConcepts.map(stripODataRow),
  };

  return rehydrateFolioBundle(draft);
}

export function encryptFolioBundle(
  cipher: SecretCipherService,
  bundle: ReservationEmmaFolioBundle,
): string {
  const normalized = rehydrateFolioBundle(bundle);
  return cipher.encrypt(JSON.stringify(normalized));
}

export function decryptFolioBundle(
  cipher: SecretCipherService,
  folioEnc: string | null | undefined,
): ReservationEmmaFolioBundle | null {
  if (!folioEnc?.trim()) return null;
  const plain = cipher.decryptSafe(folioEnc);
  if (!plain) return null;
  try {
    const bundle = JSON.parse(plain) as ReservationEmmaFolioBundle;
    return rehydrateFolioBundle(bundle);
  } catch {
    return null;
  }
}
