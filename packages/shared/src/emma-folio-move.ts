/** Parameters for EMMA Folio Management MoveCharge (from browser HAR). */
export type EmmaMoveFolioChargeParams = {
  hotelId: string;
  reservationId: string;
  /** Source folio id, e.g. "01". */
  sourceFolioId: string;
  /** Charge row id (NumRow), e.g. "000007". */
  chargeRowId: string;
  /** Destination folio id, e.g. "02". */
  destinationFolioId: string;
  /** Defaults to reservationId when omitted. */
  destinationReservationId?: string;
  /** SAP employee number for MoveCharge (defaults from EMMA operator login). */
  employee?: string;
  /** Call ValidateMoveCharge before MoveCharge (EMMA UI does this). Default true. */
  validate?: boolean;
};

export type EmmaMoveFolioChargeResult = {
  chargeId: string;
  concept: string | null;
  folioId: string | null;
  amount: string | null;
  description: string | null;
  statusCharge: string | null;
};

/** One charge move within a batch (same reservation). */
export type EmmaMoveFolioChargeItem = {
  sourceFolioId: string;
  chargeRowId: string;
  destinationFolioId: string;
  destinationReservationId?: string;
};

/** Move multiple charges in a single EMMA folio edit session. */
export type EmmaMoveFolioChargesParams = {
  hotelId: string;
  reservationId: string;
  moves: EmmaMoveFolioChargeItem[];
  employee?: string;
  validate?: boolean;
};

/** API body for POST /reservations/:id/move-folio-charge */
export type MoveReservationFolioChargeBody = {
  sourceFolioId: string;
  chargeRowId: string;
  destinationFolioId: string;
  hotelId?: string;
};

/** Concepts historically routed to company folio during arrival check (legacy helper). */
export const ARRIVAL_CHECK_COMPANY_FOLIO_CONCEPTS = ['BB', 'RO'] as const;

/** Tax concepts that always stay on the guest folio (Folio 1): city tax + hotel tax. */
export const ARRIVAL_CHECK_TAX_CONCEPTS = ['CTAX', 'CTAX2'] as const;

/** Room / board concepts moved to the company folio (Folio 2) for VCC bookings. */
export const ARRIVAL_CHECK_ROOM_BOARD_CONCEPTS = ['RO', 'BB'] as const;

/** Pre-payment / deposit concepts that must NEVER be moved between folios. */
export const ARRIVAL_CHECK_PREPAYMENT_CONCEPTS = ['PPWO'] as const;

/** EMMA ConceptNature for pre-payment / deposit lines. */
export const ARRIVAL_CHECK_PREPAYMENT_NATURE = '51';

const TAX_TEXT_RX = /city\s*tax|hotel\s*tax|kurtaxe|beherbergungsabgabe/i;
const PREPAYMENT_TEXT_RX = /pre-?payment|prepayment|anzahlung|vorauszahlung|acconto|deposit/i;

export function isArrivalCheckTaxConcept(concept: string | null | undefined): boolean {
  if (!concept) return false;
  return (ARRIVAL_CHECK_TAX_CONCEPTS as readonly string[]).includes(concept.trim().toUpperCase());
}

/** Tax charge (city tax or hotel tax) by concept code or EMMA description. */
export function isArrivalCheckTaxCharge(charge: {
  concept?: string | null;
  description?: string | null;
  conceptNature?: string | null;
}): boolean {
  if (isArrivalCheckTaxConcept(charge.concept)) return true;
  const desc = String(charge.description ?? '').trim();
  if (desc && TAX_TEXT_RX.test(desc)) return true;
  const nature = String(charge.conceptNature ?? '').trim();
  if (nature && TAX_TEXT_RX.test(nature)) return true;
  return false;
}

export function isArrivalCheckRoomBoardConcept(concept: string | null | undefined): boolean {
  if (!concept) return false;
  return (ARRIVAL_CHECK_ROOM_BOARD_CONCEPTS as readonly string[]).includes(
    concept.trim().toUpperCase(),
  );
}

/**
 * Pre-payment / deposit line (EMMA concept PPWO / ConceptNature 51 / "Pre-payment").
 * These must never be moved between folios during the arrival check.
 */
export function isArrivalCheckPrepaymentCharge(charge: {
  concept?: string | null;
  description?: string | null;
  conceptNature?: string | null;
}): boolean {
  const concept = String(charge.concept ?? '').trim().toUpperCase();
  if (concept && (ARRIVAL_CHECK_PREPAYMENT_CONCEPTS as readonly string[]).includes(concept)) {
    return true;
  }
  if (String(charge.conceptNature ?? '').trim() === ARRIVAL_CHECK_PREPAYMENT_NATURE) return true;
  const desc = String(charge.description ?? '').trim();
  return Boolean(desc && PREPAYMENT_TEXT_RX.test(desc));
}
