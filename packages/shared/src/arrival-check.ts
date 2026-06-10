export type ArrivalCheckRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type ArrivalCheckItemStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export type ArrivalCheckStep = 'FOLIO_LOAD' | 'CHARGE_ASSIGN' | 'PREPAID_SETTLE';

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
};

export type ArrivalCheckRunDetail = ArrivalCheckRunSummary & {
  items: ArrivalCheckRunItem[];
};

export type CreateArrivalCheckRunBody = {
  reservationIds: string[];
  hotelId?: string;
};
