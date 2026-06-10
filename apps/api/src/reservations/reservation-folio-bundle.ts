import type {
  ReservationEmmaFolioBundle,
  ReservationFolioCharge,
} from '@housekeeping/shared';
import {
  groupChargesByFolio,
  normalizeFolioCharge,
  sortFolioCharges,
} from '@housekeeping/shared';
import type { SecretCipherService } from '../common/crypto/secret-cipher.service';

export type { ReservationEmmaFolioBundle, ReservationFolioCharge };
export { normalizeFolioCharge };

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

/**
 * EMMA exposes charges on reservation.FolioDetails (complete) and per Folios/Details (partial).
 * Always prefer FolioDetails; nested Details may list charges under the wrong folio card.
 */
export function extractFolioCharges(
  reservation: Record<string, unknown>,
  folios: Record<string, unknown>[],
): ReservationFolioCharge[] {
  const byId = new Map<string, ReservationFolioCharge>();

  const add = (row: Record<string, unknown>, parentFolioId?: string) => {
    const charge = normalizeFolioCharge(row, parentFolioId);
    if (!charge.id) return;
    byId.set(charge.id, charge);
  };

  const topLevel = odataResults(reservation.FolioDetails);
  if (topLevel.length > 0) {
    for (const row of topLevel) add(row);
  } else {
    for (const folio of folios) {
      const parentId = String(folio.Id ?? '');
      for (const row of odataResults(folio.Details)) {
        add(row, parentId);
      }
    }
  }

  return sortFolioCharges([...byId.values()]);
}

export function buildReservationFolioBundle(input: {
  reservation: Record<string, unknown>;
  remarks: Record<string, unknown> | null;
  depositConcepts: Record<string, unknown>[];
  fetchedAt: Date;
}): ReservationEmmaFolioBundle {
  const reservation = stripODataRow(input.reservation);
  const folios = odataResults(reservation.Folios).map(stripODataRow);
  const charges = extractFolioCharges(reservation, folios);
  const folioIds = folios.map((f) => String(f.Id ?? ''));
  const chargesByFolio = groupChargesByFolio(charges, folioIds);

  const amountRaw = reservation.Amount;
  const amount =
    amountRaw && typeof amountRaw === 'object' && !('__deferred' in (amountRaw as object))
      ? stripODataRow(amountRaw as Record<string, unknown>)
      : null;
  const mainCustomerRaw = reservation.MainCustomer;
  const mainGuestRaw = reservation.MainGuest;

  return {
    fetchedAt: input.fetchedAt.toISOString(),
    reservation,
    folios,
    charges,
    chargesByFolio,
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
}

export function encryptFolioBundle(
  cipher: SecretCipherService,
  bundle: ReservationEmmaFolioBundle,
): string {
  return cipher.encrypt(JSON.stringify(bundle));
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
    if (!bundle.chargesByFolio && bundle.charges?.length && bundle.folios?.length) {
      bundle.chargesByFolio = groupChargesByFolio(
        bundle.charges,
        bundle.folios.map((f) => String(f.Id ?? '')),
      );
    }
    return bundle;
  } catch {
    return null;
  }
}
