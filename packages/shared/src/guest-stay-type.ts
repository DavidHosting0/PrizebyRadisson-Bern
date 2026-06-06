/** Guest stay category signals (EMMA / reservation snapshot). */
export type GuestStaySignals = {
  /** EMMA Stayover flag (housekeeping stayover). */
  stayover?: boolean;
  /** Derived: im Haus, Anreise vor heute, Abreise nach heute (or EMMA stayover). */
  isRestant?: boolean;
  isArrivalToday?: boolean;
  isDepartureToday?: boolean;
  checkOut?: boolean;
  ocoDone?: boolean;
};

export type GuestStayDeriveInput = {
  arrivalDate: string;
  departureDate: string;
  today: string;
  checkIn?: boolean;
  checkOut?: boolean;
  stayover?: boolean;
  ocoDone?: boolean;
};

/**
 * Classify in-house guest for UI icons.
 * Restant = continuing stay (not new today, not leaving today).
 * EMMA's Stayover flag is rare; date-based restant matches front-office usage.
 */
export function deriveGuestStaySignals(input: GuestStayDeriveInput): GuestStaySignals {
  const { arrivalDate, departureDate, today } = input;
  const checkOut = input.checkOut === true;
  const checkIn = input.checkIn !== false;
  const emmaStayover = input.stayover === true;

  const isArrivalToday = arrivalDate === today;
  const isDepartureToday = departureDate === today;
  const dateRestant =
    checkIn &&
    !checkOut &&
    !isArrivalToday &&
    !isDepartureToday &&
    arrivalDate < today &&
    departureDate > today;

  return {
    stayover: emmaStayover,
    isRestant: dateRestant || emmaStayover,
    isArrivalToday,
    isDepartureToday,
    checkOut,
    ocoDone: input.ocoDone === true,
  };
}
