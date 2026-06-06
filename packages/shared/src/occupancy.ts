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
  ocoDone: boolean;
};
