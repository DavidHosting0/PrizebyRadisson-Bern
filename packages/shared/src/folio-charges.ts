import type { ReservationEmmaFolioBundle, ReservationFolioCharge } from './reservations';

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

function chargeNumericId(c: ReservationFolioCharge): number {
  const n = parseInt(c.id, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Same business line posted again in EMMA — keep highest Id (newest). */
export function dedupeNewestFolioCharges(
  charges: ReservationFolioCharge[],
): ReservationFolioCharge[] {
  const byKey = new Map<string, ReservationFolioCharge>();
  for (const c of charges) {
    const key = [
      normalizeFolioId(c.folioId),
      c.concept ?? '',
      c.productionDate ?? '',
      c.description ?? '',
      c.amount ?? '',
      c.quantity ?? '',
    ].join('|');
    const existing = byKey.get(key);
    if (!existing || chargeNumericId(c) > chargeNumericId(existing)) {
      byKey.set(key, c);
    }
  }
  return sortFolioCharges([...byKey.values()]);
}

/** EMMA folio UI hides superseded/reposted charges (StatusCharge 02/03). */
export function isEmmaVisibleFolioCharge(row: Record<string, unknown>): boolean {
  const statusCharge = str(row.StatusCharge);
  return statusCharge !== '02' && statusCharge !== '03';
}

/** Map raw EMMA charge row to normalized charge. */
export function normalizeFolioCharge(
  row: Record<string, unknown>,
  /** Folio id from FolioDetailsHeader.Folio (authoritative). */
  assignedFolioId?: string,
): ReservationFolioCharge {
  const id = String(row.Id ?? '').trim();
  const folioId = assignedFolioId
    ? normalizeFolioId(assignedFolioId)
    : normalizeFolioId(row.Folio);

  return {
    id,
    position: id || null,
    folioId: folioId || null,
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

/** Assign charges to folio cards by charge.folioId. */
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
  if (chargesByFolio && Object.prototype.hasOwnProperty.call(chargesByFolio, fid)) {
    return chargesByFolio[fid];
  }
  return sortFolioCharges(charges.filter((c) => folioIdsMatch(c.folioId, fid)));
}

function odataResults(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  const results = (value as { results?: unknown[] }).results;
  if (!Array.isArray(results)) return [];
  return results.filter(
    (r): r is Record<string, unknown> => r != null && typeof r === 'object',
  );
}

function addChargeRow(
  byId: Map<string, ReservationFolioCharge>,
  row: Record<string, unknown>,
  assignedFolioId: string,
) {
  if (!isEmmaVisibleFolioCharge(row)) return;
  const charge = normalizeFolioCharge(row, assignedFolioId);
  if (!charge.id) return;
  byId.set(charge.id, charge);
}

/** Extract from FolioDetailsHeader (+ nested FolioDetailsLine), matching EMMA folio UI. */
export function extractFolioChargesFromDetailsHeader(
  headers: Record<string, unknown>[],
): ReservationFolioCharge[] {
  const byId = new Map<string, ReservationFolioCharge>();
  for (const header of headers) {
    const folioId = String(header.Folio ?? '').trim();
    if (!folioId) continue;
    addChargeRow(byId, header, folioId);
    for (const line of odataResults(header.FolioDetailsLine)) {
      addChargeRow(byId, line, folioId);
    }
  }
  return dedupeNewestFolioCharges([...byId.values()]);
}

/**
 * Build charge list from stored EMMA payload.
 * Prefer FolioDetailsHeader (FolioReservationSet) — same source as EMMA folio cards.
 * Fall back to flat FolioDetails when headers are absent (legacy bundles).
 */
export function extractFolioChargesFromEmma(
  reservation: Record<string, unknown>,
  folioDetailsHeader?: Record<string, unknown>[],
): ReservationFolioCharge[] {
  const headers =
    folioDetailsHeader ??
    odataResults(reservation.FolioDetailsHeader);

  if (headers.length > 0) {
    return extractFolioChargesFromDetailsHeader(headers);
  }

  const byId = new Map<string, ReservationFolioCharge>();
  for (const row of odataResults(reservation.FolioDetails)) {
    if (!isEmmaVisibleFolioCharge(row)) continue;
    const charge = normalizeFolioCharge(row);
    if (!charge.id) continue;
    byId.set(charge.id, charge);
  }
  return dedupeNewestFolioCharges([...byId.values()]);
}

/** Recompute charges from raw EMMA JSON (fixes stale bundles in DB). */
export function rehydrateFolioBundle(
  bundle: ReservationEmmaFolioBundle,
): ReservationEmmaFolioBundle {
  const reservation = { ...bundle.reservation };
  const folioDetailsHeader =
    bundle.folioDetailsHeader ?? odataResults(reservation.FolioDetailsHeader);
  const charges = extractFolioChargesFromEmma(reservation, folioDetailsHeader);
  const folios = (bundle.folios ?? odataResults(reservation.Folios)).map((f) => {
    const { Details: _details, ...rest } = f;
    return rest;
  });
  const folioIds = folios.map((f) => String(f.Id ?? ''));
  return {
    ...bundle,
    folios,
    folioDetailsHeader,
    charges,
    chargesByFolio: groupChargesByFolio(charges, folioIds),
  };
}
