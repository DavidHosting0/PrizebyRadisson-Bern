/** Hotel property timezone (Prize Bern). */
export const HOTEL_TIME_ZONE = 'Europe/Zurich';

/** Guest stay category signals (EMMA / reservation snapshot). */
export type GuestStaySignals = {
  /** EMMA Stayover flag (housekeeping stayover). */
  stayover?: boolean;
  /** Im Haus, heute weder Anreise noch Abreise. */
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
  /** Row is from EMMA in-house list (checked in, not departed). */
  inHouse?: boolean;
};

/** Format Prisma @db.Date or ISO string as YYYY-MM-DD in hotel timezone. */
export function formatHotelDateOnly(value: Date | string): string {
  if (typeof value === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-CA', { timeZone: HOTEL_TIME_ZONE }).format(d);
}

export function hotelTodayIso(timeZone = HOTEL_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * Classify in-house guest for UI icons.
 * Restant (per front office): in-house guest with neither check-in nor check-out today.
 * Departure today remains true after checkout (same calendar day) so housekeeping can
 * keep departure work visible until inspection.
 */
export function deriveGuestStaySignals(input: GuestStayDeriveInput): GuestStaySignals {
  const arrivalDate = formatHotelDateOnly(input.arrivalDate);
  const departureDate = formatHotelDateOnly(input.departureDate);
  const today = input.today;

  const checkOut = input.checkOut === true;
  const checkIn = input.inHouse ? true : input.checkIn !== false;
  const emmaStayover = input.stayover === true;

  const isArrivalToday = arrivalDate === today;
  const isDepartureToday = departureDate === today;
  const isRestant =
    checkIn && !checkOut && !isArrivalToday && !isDepartureToday;

  return {
    stayover: emmaStayover,
    isRestant,
    isArrivalToday,
    isDepartureToday,
    checkOut,
    ocoDone: input.ocoDone === true,
  };
}
