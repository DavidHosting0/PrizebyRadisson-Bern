export type ReservationTimelinePoint = {
  at: string;
  checkInDone: number;
  checkInQueue: number;
  checkInPending: number;
  arrivals: number;
  inHouse: number;
  departures: number;
  checkOutToday: number;
  checkOutDone: number;
  remainingCheckIns: number;
};

export type ReservationTimelineResponse = {
  date: string;
  businessDate: string;
  points: ReservationTimelinePoint[];
  firstDataAt: string | null;
  lastDataAt: string | null;
  syncCount: number;
};

export type ReservationCheckInRateBucket = {
  /** ISO start of bucket window */
  bucketStart: string;
  /** ISO end of bucket window */
  bucketEnd: string;
  /** Label for chart axis, e.g. "14:00" */
  label: string;
  checkIns: number;
};

export type ReservationCheckInRateResponse = {
  date: string;
  bucketMinutes: number;
  buckets: ReservationCheckInRateBucket[];
  peakWindow: {
    bucketStart: string;
    bucketEnd: string;
    label: string;
    checkIns: number;
  } | null;
  totalCheckIns: number;
};

export type ReservationDailySummaryRow = {
  date: string;
  arrivals: number;
  checkInDone: number;
  peakQueue: number;
  minRemainingCheckIns: number;
  maxRemainingCheckIns: number;
  syncCount: number;
};

export type ReservationDailySummaryResponse = {
  from: string;
  to: string;
  days: ReservationDailySummaryRow[];
};

export type ReservationBreakdownGroup = {
  key: string;
  count: number;
  totalPax: number;
};

export type ReservationBreakdownResponse = {
  date: string;
  totalArrivals: number;
  totalPax: number;
  avgNightsStay: number | null;
  arrivalCheckCompleted: number;
  arrivalCheckPending: number;
  inTodayArrivals: number;
  inQueue: number;
  checkInsDone: number;
  byRoomType: ReservationBreakdownGroup[];
  byMealPlan: ReservationBreakdownGroup[];
  byTier: ReservationBreakdownGroup[];
};
