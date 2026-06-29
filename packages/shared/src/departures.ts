export type DailyDepartureAssignee = {
  id: string;
  name: string;
  titlePrefix: string;
};

export type DailyDepartureItem = {
  reservationId: string;
  roomId: string;
  roomNumber: string;
  floor: number | null;
  mainGuestName: string | null;
  expectedDepartureTime: string | null;
  checkOut: boolean;
  assignedHousekeeper: DailyDepartureAssignee | null;
};

export type DailyDepartureUnmapped = {
  emmaRoomId: string;
  reservationId: string;
};

export type DailyDeparturesResponse = {
  date: string;
  items: DailyDepartureItem[];
  emmaExpectedCount: number | null;
  syncedAt: string | null;
  unmappedRooms: DailyDepartureUnmapped[];
  warnings: string[];
};

export type AssignmentSuggestionRow = {
  roomId: string;
  roomNumber: string;
  floor: number | null;
  suggestedHousekeeperId: string;
};

export type HousekeeperAssignSummary = {
  housekeeperId: string;
  count: number;
  floors: number[];
};

export type AssignmentSuggestionsResponse = {
  date: string;
  departureRooms: number;
  suggestions: AssignmentSuggestionRow[];
  summaries: HousekeeperAssignSummary[];
};

export type RunAutoAssignResponse = {
  date: string;
  assigned: number;
  summaries: HousekeeperAssignSummary[];
};
