import type {
  ReservationEmmaFolioBundle,
  ReservationFolioCharge,
} from '@housekeeping/shared';
import type { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { parseEmmaDateToIso } from './reservation-sensitive';

export type { ReservationEmmaFolioBundle, ReservationFolioCharge };

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

function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

export function normalizeFolioCharge(row: Record<string, unknown>): ReservationFolioCharge {
  return {
    id: String(row.Id ?? ''),
    folioId: str(row.Folio),
    concept: str(row.Concept),
    conceptNature: str(row.ConceptNature),
    description: str(row.Description),
    guestName: str(row.GuestName),
    productionDate: parseEmmaDateToIso(row.ProductionDate),
    chargeType: str(row.ChargeType),
    status: str(row.Status),
    quantity: str(row.Quantity),
    price: str(row.Price),
    priceWithTax: str(row.PriceWithTax),
    amount: str(row.Amount),
    taxAmount: str(row.TaxAmount),
    currency: str(row.Currency),
  };
}

export function extractFolioCharges(
  reservation: Record<string, unknown>,
  folios: Record<string, unknown>[],
): ReservationFolioCharge[] {
  const byId = new Map<string, ReservationFolioCharge>();

  for (const row of odataResults(reservation.FolioDetails)) {
    const charge = normalizeFolioCharge(row);
    if (charge.id) byId.set(charge.id, charge);
  }

  for (const folio of folios) {
    for (const row of odataResults(folio.Details)) {
      const charge = normalizeFolioCharge(row);
      if (charge.id) byId.set(charge.id, charge);
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
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

  return {
    fetchedAt: input.fetchedAt.toISOString(),
    reservation,
    folios,
    charges: extractFolioCharges(reservation, folios),
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
    return JSON.parse(plain) as ReservationEmmaFolioBundle;
  } catch {
    return null;
  }
}
