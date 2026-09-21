/** Hotel property timezone (Prize Bern). */
export const HOTEL_TIME_ZONE = 'Europe/Zurich';

/** Nights already in house before a restant counts as thorough / extensive. */
export const EXTENSIVE_RESTANT_MIN_NIGHTS = 5;

/** Guest stay category signals (EMMA / reservation snapshot). */
export type GuestStaySignals = {
  /** EMMA Stayover flag (housekeeping stayover). */
  stayover?: boolean;
  /** Im Haus, heute weder Anreise noch Abreise. */
  isRestant?: boolean;
  /**
   * Restant guest already in house for ≥ {@link EXTENSIVE_RESTANT_MIN_NIGHTS} nights
   * — needs a thorough restant clean.
   */
  isExtensiveRestant?: boolean;
  /** Calendar nights since arrival (arrival day = 0). */
  nightsInHouse?: number;
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

/** Calendar day difference between two YYYY-MM-DD strings (to − from). */
export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
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
  const nightsInHouse = Math.max(0, calendarDaysBetween(arrivalDate, today));
  const isExtensiveRestant = isRestant && nightsInHouse >= EXTENSIVE_RESTANT_MIN_NIGHTS;

  return {
    stayover: emmaStayover,
    isRestant,
    isExtensiveRestant,
    nightsInHouse,
    isArrivalToday,
    isDepartureToday,
    checkOut,
    ocoDone: input.ocoDone === true,
  };
}
