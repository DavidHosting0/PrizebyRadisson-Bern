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

/** Concepts routed to company folio 2 during arrival check (guest folio keeps CTAX). */
export const ARRIVAL_CHECK_COMPANY_FOLIO_CONCEPTS = ['BB', 'CTAX2'] as const;

/** Tax concepts that always stay on the guest folio (Folio 1): city tax + hotel tax. */
export const ARRIVAL_CHECK_TAX_CONCEPTS = ['CTAX', 'CTAX2'] as const;

/** Room / board concepts moved to the company folio (Folio 2) for VCC bookings. */
export const ARRIVAL_CHECK_ROOM_BOARD_CONCEPTS = ['RO', 'BB'] as const;

export function isArrivalCheckTaxConcept(concept: string | null | undefined): boolean {
  if (!concept) return false;
  return (ARRIVAL_CHECK_TAX_CONCEPTS as readonly string[]).includes(concept.trim().toUpperCase());
}

export function isArrivalCheckRoomBoardConcept(concept: string | null | undefined): boolean {
  if (!concept) return false;
  return (ARRIVAL_CHECK_ROOM_BOARD_CONCEPTS as readonly string[]).includes(
    concept.trim().toUpperCase(),
  );
}
