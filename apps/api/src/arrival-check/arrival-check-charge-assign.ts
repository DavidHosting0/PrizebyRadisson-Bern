import type { ReservationEmmaFolioBundle, ReservationFolioCharge } from '@housekeeping/shared';
import {
  ARRIVAL_CHECK_COMPANY_FOLIO_CONCEPTS,
  normalizeFolioId,
} from '@housekeeping/shared';

export type FolioChargeMovePlan = {
  chargeRowId: string;
  sourceFolioId: string;
  destinationFolioId: string;
  concept: string | null;
  description: string | null;
  amount: string | null;
};

/** Company folio: first non-guest folio with a bill holder (EMMA NameHolder / Holder). */
export function findCompanyFolioId(folios: Record<string, unknown>[]): string | null {
  const sorted = [...folios].sort((a, b) =>
    String(a.Id ?? '').localeCompare(String(b.Id ?? ''), undefined, { numeric: true }),
  );
  for (const folio of sorted) {
    const id = normalizeFolioId(folio.Id);
    if (!id || id === '01') continue;
    const name = String(folio.NameHolder ?? folio.Holder ?? '').trim();
    if (name) return id;
  }
  const second = sorted.find((f) => normalizeFolioId(f.Id) === '02');
  return second ? '02' : null;
}

function chargeRowId(charge: ReservationFolioCharge): string {
  return String(charge.position ?? charge.id).trim();
}

function isMovableConcept(concept: string | null | undefined): boolean {
  if (!concept) return false;
  return (ARRIVAL_CHECK_COMPANY_FOLIO_CONCEPTS as readonly string[]).includes(concept);
}

/**
 * Legacy helper: charges on guest folio 01 that should live on the company folio (RO + BB).
 * Tax charges (CTAX city tax, CTAX2 hotel tax) stay on folio 01.
 */
export function planGuestToCompanyChargeMoves(
  bundle: ReservationEmmaFolioBundle,
  guestFolioId = '01',
): FolioChargeMovePlan[] {
  const companyFolioId = findCompanyFolioId(bundle.folios ?? []);
  if (!companyFolioId) return [];

  const guestId = normalizeFolioId(guestFolioId);
  const moves: FolioChargeMovePlan[] = [];

  for (const charge of bundle.charges ?? []) {
    if (normalizeFolioId(charge.folioId) !== guestId) continue;
    if (!isMovableConcept(charge.concept)) continue;
    const rowId = chargeRowId(charge);
    if (!rowId) continue;
    moves.push({
      chargeRowId: rowId,
      sourceFolioId: guestId,
      destinationFolioId: companyFolioId,
      concept: charge.concept,
      description: charge.description,
      amount: charge.amount,
    });
  }

  return moves.sort((a, b) =>
    a.chargeRowId.localeCompare(b.chargeRowId, undefined, { numeric: true }),
  );
}
