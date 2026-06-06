export type ReservationTab = 'arrivals' | 'queue' | 'inhouse' | 'all';

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
  detailFetchedAt?: string | null;
  folioFetchedAt?: string | null;
  /** Populated from EMMA In House sync (sensitive payload). */
  stayover?: boolean;
  expectedDepartureTime?: string | null;
  isDepartureToday?: boolean;
  ocoDone?: boolean;
  /** Arrival date is today (first night in house). */
  isArrivalToday?: boolean;
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
  detailFetchedAt: string | null;
  emmaDetail: ReservationEmmaDetailBundle | null;
  folioFetchedAt: string | null;
  emmaFolio: ReservationEmmaFolioBundle | null;
};

/** Normalized folio charge row for UI. */
export type ReservationFolioCharge = {
  id: string;
  folioId: string | null;
  concept: string | null;
  conceptNature: string | null;
  description: string | null;
  guestName: string | null;
  productionDate: string | null;
  chargeType: string | null;
  status: string | null;
  quantity: string | null;
  price: string | null;
  priceWithTax: string | null;
  amount: string | null;
  taxAmount: string | null;
  currency: string | null;
};

/** EMMA Folio Management payload (encrypted at rest). */
export type ReservationEmmaFolioBundle = {
  fetchedAt: string;
  reservation: Record<string, unknown>;
  folios: Record<string, unknown>[];
  charges: ReservationFolioCharge[];
  amount: Record<string, unknown> | null;
  mainCustomer: Record<string, unknown> | null;
  mainGuest: Record<string, unknown> | null;
  loanedItems: Record<string, unknown>[];
  notices: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  remarks: Record<string, unknown> | null;
  depositConcepts?: Record<string, unknown>[];
};

/** Full EMMA reservation payload fetched on manual open (encrypted at rest). */
export type ReservationEmmaDetailBundle = {
  fetchedAt: string;
  reservation: Record<string, unknown>;
  guests: Record<string, unknown>[];
  creditCards: Record<string, unknown>[];
  preauthorizations: Record<string, unknown>[];
  roomList: Record<string, unknown>[];
  loyaltyBenefits: Record<string, unknown>[];
  policeRecords: Record<string, unknown>[];
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
