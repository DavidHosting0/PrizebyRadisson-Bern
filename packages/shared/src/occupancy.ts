/** Guest occupancy joined onto a room (from EMMA reservation snapshot). */
export type RoomOccupancy = {
  reservationId: string;
  mainGuestName: string | null;
  departureDate: string;
  isDepartureToday: boolean;
  checkOut: boolean;
  stayover: boolean;
  expectedDepartureTime: string | null;
  isArrivalToday: boolean;
  isRestant: boolean;
  /** Restant guest already ≥5 nights in house — thorough restant clean. */
  isExtensiveRestant: boolean;
  /** Calendar nights since arrival (arrival day = 0). */
  nightsInHouse: number;
  ocoDone: boolean;
};
