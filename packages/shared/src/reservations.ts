export type ReservationTab = 'arrivals' | 'queue' | 'inhouse';

export type ReservationListItem = {
  id: string;
  hotelId: string;
  reservationId: string;
  roomId: string | null;
  mainGuestName: string | null;
  arrivalDate: string;
  departureDate: string;
  nightsStay: number | null;
  roomType: string | null;
  mealPlan: string | null;
  tier: string | null;
  numPax: number | null;
  vipDesc: string | null;
  checkIn: boolean;
  checkOut: boolean;
  checkInQueue: boolean;
  creditCard: string | null;
  cardHolder: string | null;
  cardExpiry: string | null;
  preAuthAmount: string | null;
  groupName: string | null;
  syncedAt: string;
  inTodayArrivals?: boolean;
};

export type ReservationDetail = ReservationListItem & {
  mainGuestId: string | null;
  mainClientName: string | null;
  bookingFileId: string | null;
  groupId: string | null;
  companyName: string | null;
  travelAgent: string | null;
  rateCode: string | null;
  sourceCode: string | null;
  marketCode: string | null;
  balance: string | null;
  comments: string | null;
  draftStatus: string | null;
  draftLockedBy: string | null;
  stays: string | null;
  guests: string | null;
  ciStatusSigned: boolean;
  stayover: boolean;
  noMove: boolean;
  originalRoomType: string | null;
  roomTypeUpg: string | null;
  numPax2: number | null;
  numPax3: number | null;
  numPax4: number | null;
  checkInQDate: string | null;
};

export type ReservationOverview = {
  hotelId: string;
  checkInDone: number;
  checkInQueue: number;
  checkInPending: number;
  arrivals: number;
  checkOutDone: number;
  checkOutToday: number;
  inHouse: number;
  departures: number;
  lastSyncedAt: string | null;
  /** Rows currently marked visible on the arrivals board (DB). */
  visibleArrivals: number;
};

export type ReservationSyncStatus = {
  lastRun: {
    id: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
    rowCount: number | null;
    error: string | null;
  } | null;
  overview: ReservationOverview | null;
};
