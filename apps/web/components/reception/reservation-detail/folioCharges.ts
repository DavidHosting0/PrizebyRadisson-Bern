import type { ReservationFolioCharge } from '@housekeeping/shared';

function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

function parseEmmaDateToIso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const m = /\/Date\((-?\d+)\)\//.exec(value);
    if (m) return new Date(parseInt(m[1], 10)).toISOString();
    return value.trim() || null;
  }
  return null;
}

/** Map raw EMMA FolioDetails row to normalized charge (mirrors API bundle). */
export function normalizeFolioChargeFromRow(row: Record<string, unknown>): ReservationFolioCharge {
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
