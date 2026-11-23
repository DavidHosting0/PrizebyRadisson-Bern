/**
 * Validation + create payload for automatic BernTicket creation during arrival check.
 * Caps: max 3 persons, max 30 nights (calendar days between arrival and departure).
 */

export const BERN_TICKET_MAX_PAX = 3;
export const BERN_TICKET_MAX_STAY_DAYS = 30;

export type BernTicketArrivalCreateBody = {
  guestName: string;
  bookingNumber: string;
  validFrom: string;
  validTo: string;
  ticketsAmount: number;
};

export type BernTicketArrivalInput = {
  guestName: string | null | undefined;
  bookingNumber: string | null | undefined;
  /** YYYY-MM-DD */
  arrivalDate: string | null | undefined;
  /** YYYY-MM-DD */
  departureDate: string | null | undefined;
  numPax: number | null | undefined;
};

export type BernTicketArrivalPrepareResult =
  | { ok: true; body: BernTicketArrivalCreateBody }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  if (!DATE_RE.test(value)) return null;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

/** Calendar-day difference (departure − arrival). Same day → 0. */
export function bernTicketStayDays(arrivalDate: string, departureDate: string): number | null {
  const a = parseYmd(arrivalDate);
  const b = parseYmd(departureDate);
  if (!a || !b) return null;
  const utcA = Date.UTC(a.y, a.m - 1, a.d);
  const utcB = Date.UTC(b.y, b.m - 1, b.d);
  const days = Math.round((utcB - utcA) / 86_400_000);
  return days;
}

/**
 * Validate snapshot fields and build the BernTicket create body.
 * Does not call the network — callers decide whether to POST.
 */
export function prepareBernTicketForArrival(
  input: BernTicketArrivalInput,
): BernTicketArrivalPrepareResult {
  const guestName = input.guestName?.trim() ?? '';
  if (!guestName) {
    return { ok: false, error: 'Gastname fehlt — BernTicket nicht erstellt.' };
  }

  const bookingNumber = input.bookingNumber?.trim() ?? '';
  if (!bookingNumber) {
    return { ok: false, error: 'Buchungsnummer fehlt — BernTicket nicht erstellt.' };
  }

  const validFrom = input.arrivalDate?.trim().slice(0, 10) ?? '';
  const validTo = input.departureDate?.trim().slice(0, 10) ?? '';
  if (!DATE_RE.test(validFrom) || !DATE_RE.test(validTo)) {
    return { ok: false, error: 'An-/Abreisedatum ungültig — BernTicket nicht erstellt.' };
  }

  const stayDays = bernTicketStayDays(validFrom, validTo);
  if (stayDays === null) {
    return { ok: false, error: 'An-/Abreisedatum ungültig — BernTicket nicht erstellt.' };
  }
  if (stayDays < 0) {
    return { ok: false, error: 'Abreise vor Anreise — BernTicket nicht erstellt.' };
  }
  if (stayDays > BERN_TICKET_MAX_STAY_DAYS) {
    return {
      ok: false,
      error: `Aufenthalt länger als ${BERN_TICKET_MAX_STAY_DAYS} Tage — BernTicket nicht erstellt.`,
    };
  }

  const pax = input.numPax;
  if (pax == null || !Number.isFinite(pax) || !Number.isInteger(pax)) {
    return { ok: false, error: 'Personenanzahl fehlt — BernTicket nicht erstellt.' };
  }
  if (pax < 1) {
    return { ok: false, error: 'Personenanzahl ungültig — BernTicket nicht erstellt.' };
  }
  if (pax > BERN_TICKET_MAX_PAX) {
    return {
      ok: false,
      error: `Mehr als ${BERN_TICKET_MAX_PAX} Personen — BernTicket nicht erstellt.`,
    };
  }

  return {
    ok: true,
    body: {
      guestName,
      bookingNumber,
      validFrom,
      validTo,
      ticketsAmount: pax,
    },
  };
}
