export type ArrivalCheckRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type ArrivalCheckItemStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'NEEDS_MANUAL';

export type ArrivalCheckStep = 'FOLIO_LOAD' | 'CHARGE_ASSIGN' | 'PREPAID_SETTLE';

/** Detected booking source / client group. */
export type ArrivalCheckSource =
  | 'BOOKING'
  | 'EXPEDIA'
  | 'AGODA'
  | 'RADISSON'
  | 'CTRIP'
  | 'OTHER';

/**
 * Resolved handling scenario per reservation:
 * - VCC: virtual card present → room/board to Folio 2, taxes stay on Folio 1.
 * - PREPAID: no VCC but prepaid rate → consolidate all charges on Folio 1.
 * - FLEXIBLE: no VCC, flexible rate → no charge moves.
 * - DIRECT: Radisson direct / CTrip → consolidate all charges on Folio 1.
 * - MANUAL: no rule matched or a runtime error → manual intervention.
 */
export type ArrivalCheckScenario = 'VCC' | 'PREPAID' | 'FLEXIBLE' | 'DIRECT' | 'MANUAL';

/** Human-readable label for a source/scenario combination (de-CH). */
export function arrivalCheckCategoryLabel(
  source: ArrivalCheckSource,
  scenario: ArrivalCheckScenario,
): string {
  const sourceLabel: Record<ArrivalCheckSource, string> = {
    BOOKING: 'Booking',
    EXPEDIA: 'Expedia',
    AGODA: 'Agoda',
    RADISSON: 'Radisson',
    CTRIP: 'CTrip',
    OTHER: 'Unbekannt',
  };
  const s = sourceLabel[source];
  switch (scenario) {
    case 'VCC':
      return `${s} mit VCC`;
    case 'PREPAID':
      return `${s} Prepaid (Folio 1)`;
    case 'FLEXIBLE':
      return `${s} ohne VCC – flexibel`;
    case 'DIRECT':
      return `${s} – Folio 1`;
    case 'MANUAL':
    default:
      return `${s} – manuell`;
  }
}

export type ArrivalCheckRunItem = {
  id: string;
  reservationId: string;
  hotelId: string;
  status: ArrivalCheckItemStatus;
  currentStep: ArrivalCheckStep | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  mainGuestName: string | null;
  roomId: string | null;
  arrivalDate: string;
  departureDate: string;
  roomType: string | null;
  numPax: number | null;
  /** Detected booking source / client group. */
  source: ArrivalCheckSource | null;
  /** Resolved handling scenario. */
  scenario: ArrivalCheckScenario | null;
  /** Human-readable category label (source + scenario). */
  categoryLabel: string | null;
  /** Latest professional status message for the live status bar. */
  statusMessage: string | null;
  /** Reason a reservation needs manual intervention (unknown source, lock, etc.). */
  manualReason: string | null;
  /** Number of charge moves planned for this reservation. */
  movesPlanned: number;
  /** Number of charge moves successfully performed. */
  movesDone: number;
};

export type ArrivalCheckCategoryCount = {
  source: ArrivalCheckSource;
  scenario: ArrivalCheckScenario;
  label: string;
  count: number;
};

export type ArrivalCheckRunSummary = {
  id: string;
  hotelId: string;
  status: ArrivalCheckRunStatus;
  startedAt: string;
  finishedAt: string | null;
  createdByUserId: string;
  createdByName: string;
  itemCount: number;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  /** Items flagged for manual intervention (NEEDS_MANUAL). */
  manualCount: number;
  /** Aggregated counts grouped by source + scenario for the overview. */
  categoryCounts: ArrivalCheckCategoryCount[];
};

export type ArrivalCheckRunDetail = ArrivalCheckRunSummary & {
  items: ArrivalCheckRunItem[];
};

export type CreateArrivalCheckRunBody = {
  reservationIds: string[];
  hotelId?: string;
};
