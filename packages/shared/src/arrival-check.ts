export type ArrivalCheckRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type ArrivalCheckItemStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'NEEDS_MANUAL';

export type ArrivalCheckStep = 'FOLIO_LOAD' | 'CHARGE_ASSIGN' | 'PREPAID_SETTLE';

/**
 * VCC auto-payment outcome per reservation:
 * - NOT_REQUIRED: no VCC charge applies (flexible, Radisson direct, personal card, …).
 * - PLANNED: a VCC charge is planned but not yet executed.
 * - PAID: the stored VCC token was charged successfully.
 * - DECLINED: the payment gateway declined the VCC (manual intervention, shown red).
 * - SKIPPED: a VCC charge was expected but could not run safely (e.g. multiple VCCs).
 */
export type ArrivalCheckPaymentStatus =
  | 'NOT_REQUIRED'
  | 'PLANNED'
  | 'PAID'
  | 'DECLINED'
  | 'SKIPPED';

/** Detected booking source / client group. */
export type ArrivalCheckSource =
  | 'BOOKING'
  | 'EXPEDIA'
  | 'AGODA'
  | 'RADISSON'
  | 'CTRIP'
  | 'APPSMEDIA_IOS'
  | 'OTHER';

/**
 * Resolved handling scenario per reservation:
 * - VCC: virtual card present → room/board to Folio 2, taxes stay on Folio 1.
 * - PREPAID: no VCC but prepaid rate → consolidate all charges on Folio 1.
 * - FLEXIBLE: no VCC, flexible rate → no charge moves.
 * - DIRECT: Radisson direct → Folio 1; CTrip / App Media iOS → Folio 2.
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
    APPSMEDIA_IOS: 'App Media iOS',
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
      return source === 'CTRIP' || source === 'APPSMEDIA_IOS'
        ? `${s} – Folio 2`
        : `${s} – Folio 1`;
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
  /** VCC auto-payment status (null = not evaluated yet). */
  paymentStatus: ArrivalCheckPaymentStatus | null;
  /** Amount charged / attempted on the VCC (e.g. "120.50"). */
  paymentAmount: string | null;
  /** Expected charge amount computed from folio lines before payment. */
  paymentExpectedAmount: string | null;
  /** Mask of the VCC that was selected for charging (audit). */
  paymentCardMask: string | null;
  /** EMMA invoice number — unused for deposit (without-invoice) VCC charges. */
  paymentInvoice: string | null;
  /** EMMA Deposits.Id charged without invoice. */
  paymentDepositId: string | null;
  /** Folio 2 outstanding amount stored before the VCC deposit charge. */
  folio2Amount: string | null;
  folio2Currency: string | null;
  /** Gateway decline / error message when the VCC charge did not succeed. */
  paymentError: string | null;
  /**
   * When the reservation was already completed in a previous run: ISO timestamp
   * of the earlier completion. Such items are auto-skipped to avoid double work.
   */
  alreadyCompletedAt: string | null;
  /** Run id of the earlier successful arrival check (for linking in the UI). */
  alreadyCompletedRunId: string | null;
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
  /** When true, reservations already marked completed were included for re-processing. */
  forceRerun: boolean;
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
  /** Reservations whose VCC was charged successfully. */
  paidCount: number;
  /** Reservations whose VCC was declined (manual intervention). */
  declinedCount: number;
  /** Reservations that were skipped because a previous run already completed them. */
  alreadyDoneCount: number;
  /** Aggregated counts grouped by source + scenario for the overview. */
  categoryCounts: ArrivalCheckCategoryCount[];
};

export type ArrivalCheckRunDetail = ArrivalCheckRunSummary & {
  items: ArrivalCheckRunItem[];
};

export type CreateArrivalCheckRunBody = {
  reservationIds: string[];
  hotelId?: string;
  /** Re-run even if an earlier arrival check marked these reservations as completed. */
  forceRerun?: boolean;
};
