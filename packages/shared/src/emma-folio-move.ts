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

const TAX_TEXT_RX = /city\s*tax|hotel\s*tax|kurtaxe|beherbergungsabgabe/i;

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
