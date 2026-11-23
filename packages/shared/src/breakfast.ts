export type BreakfastEntrySource = 'MANUAL' | 'EMMA';
export type BreakfastWishStatus = 'OPEN' | 'DONE' | 'CANCELLED';

/** Canonical tags for kitchen dietary / special requests. */
export const BREAKFAST_WISH_TAGS = [
  'glutenfrei',
  'vegan',
  'vegetarisch',
  'laktosefrei',
  'schweinefleischfrei',
  'allergie',
  'andere',
] as const;

export type BreakfastWishTag = (typeof BREAKFAST_WISH_TAGS)[number];

export type BreakfastDayEntryDto = {
  id: string;
  hotelId: string;
  serviceDate: string;
  room: { id: string; roomNumber: string };
  reservationId: string | null;
  persons: number;
  source: BreakfastEntrySource;
  servedAt: string | null;
  servedBy: { id: string; name: string } | null;
  hasOpenWish: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BreakfastDayStatsDto = {
  totalPersons: number;
  servedPersons: number;
  remainingPersons: number;
  totalRooms: number;
  servedRooms: number;
  remainingRooms: number;
  /** Hour 0–23 in Europe/Zurich with most served persons; null if none served. */
  peakHour: number | null;
  peakPersons: number;
  openWishesCount: number;
};

export type BreakfastTodayDto = {
  serviceDate: string;
  entries: BreakfastDayEntryDto[];
  stats: BreakfastDayStatsDto;
};

export type BreakfastForecastDayDto = {
  serviceDate: string;
  totalPersons: number;
  totalRooms: number;
};

export type UpsertBreakfastEntryPayload = {
  roomId?: string;
  roomNumber?: string;
  persons: number;
  serviceDate?: string;
  reservationId?: string | null;
};

export type ServeBreakfastEntryPayload = {
  served: boolean;
};

export type BreakfastSpecialWishDto = {
  id: string;
  hotelId: string;
  serviceDate: string;
  room: { id: string; roomNumber: string };
  tags: string[];
  note: string | null;
  status: BreakfastWishStatus;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type CreateBreakfastWishPayload = {
  roomId: string;
  serviceDate: string;
  tags: string[];
  note?: string | null;
};

export type UpdateBreakfastWishPayload = {
  tags?: string[];
  note?: string | null;
  status?: BreakfastWishStatus;
  serviceDate?: string;
};
