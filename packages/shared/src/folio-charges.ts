import type { ReservationFolioCharge } from './reservations';

/** EMMA folio ids are zero-padded (e.g. "01", "02"). */
export function normalizeFolioId(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n).padStart(2, '0') : s;
}

export function folioIdsMatch(a: unknown, b: unknown): boolean {
  const na = normalizeFolioId(a);
  const nb = normalizeFolioId(b);
  return na !== '' && nb !== '' && na === nb;
}

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

/** Map raw EMMA FolioDetails row to normalized charge. */
export function normalizeFolioCharge(
  row: Record<string, unknown>,
  parentFolioId?: string,
): ReservationFolioCharge {
  const id = String(row.Id ?? '').trim();
  const folioFromRow = str(row.Folio);
  const folioId = folioFromRow
    ? normalizeFolioId(folioFromRow)
    : parentFolioId
      ? normalizeFolioId(parentFolioId)
      : null;

  return {
    id,
    position: id || null,
    folioId,
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

export function sortFolioCharges(charges: ReservationFolioCharge[]): ReservationFolioCharge[] {
  return [...charges].sort((a, b) => {
    const pa = parseInt(a.position ?? a.id, 10);
    const pb = parseInt(b.position ?? b.id, 10);
    if (Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

/** Assign charges to folio cards by charge.Folio (not Folios/Details nesting). */
export function groupChargesByFolio(
  charges: ReservationFolioCharge[],
  folioIds: string[],
): Record<string, ReservationFolioCharge[]> {
  const out: Record<string, ReservationFolioCharge[]> = {};
  for (const raw of folioIds) {
    const fid = normalizeFolioId(raw);
    if (fid) out[fid] = [];
  }
  for (const charge of charges) {
    const fid = normalizeFolioId(charge.folioId);
    if (!fid) continue;
    if (!out[fid]) out[fid] = [];
    out[fid].push(charge);
  }
  for (const fid of Object.keys(out)) {
    out[fid] = sortFolioCharges(out[fid]);
  }
  return out;
}

export function chargesForFolio(
  folioId: unknown,
  charges: ReservationFolioCharge[],
  chargesByFolio?: Record<string, ReservationFolioCharge[]>,
): ReservationFolioCharge[] {
  const fid = normalizeFolioId(folioId);
  if (!fid) return [];
  if (chargesByFolio?.[fid]) return chargesByFolio[fid];
  return sortFolioCharges(charges.filter((c) => folioIdsMatch(c.folioId, fid)));
}
