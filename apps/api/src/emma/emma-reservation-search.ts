/**
 * Emma **Search Reservations** filter bar uses date *ranges* per field:
 * `DD.MM.YYYY - DD.MM.YYYY` (see placeholder in UI).
 *
 * **Arrival Date** for Puzzel → Emma automation is **always** the fixed inclusive
 * window {@link EMMA_ARRIVAL_SEARCH_RANGE} so bookings are not hidden by EMMA’s
 * default “today” span or by AI check-in alone.
 *
 * **Departure Date:** when `checkIn` / `checkOut` parse, use the **check-out day**
 * as a single-day range; when they do not, use the same fixed window as arrival
 * so both fields are set before **Go**.
 *
 * **Reservation / confirmation numbers** must go in the **shell-bar search**
 * (Fiori `searchbox` “Reservation, Room, Guest, Client, RR number”), not in the
 * filter row’s **External reference** field, unless that value is explicitly an
 * OTA external id. Use {@link EMMA_SHELL_RESERVATION_SEARCHBOX_NAME} with
 * Playwright `getByRole('searchbox', { name: … })`.
 *
 * **Navigation:** Open **Search Reservations** and the reservation folio **only by clicking**
 * in the UI (tiles, shell menu, filter **Go**, grid cells). **Do not** rely on
 * `page.goto` / pasting a `#…/ReservationDetail/…` hash URL — it is not a supported
 * shortcut for this app/session and will not substitute for the real click path.
 *
 * **Open reservation from results:** In the **Reservation** column, **click the field or
 * control immediately beside** the reservation number (not the blue id text alone;
 * SAP nests the id next to a sibling control in the same cell). **Do not** use the
 * **Guest Name** link — it opens **Guest Profile**, not the folio. If a single click
 * does not open `ReservationDetail`, use a **double-click** on that same adjacent target.
 *
 * **Multiple grid rows:** use {@link pickClosestEmmaReservationRow} in
 * `emma-reservation-row-pick.ts` to choose the row nearest to AI stay dates.
 *
 * Implemented Playwright flow: {@link runEmmaSearchReservationAndOpenFolio} in
 * `emma-reservation-folio-open.ts`.
 */

export type EmmaReservationSearchDateFilters = {
  /** Value for the “Arrival Date” textbox */
  arrivalRange: string;
  /** Value for the “Departure Date” textbox */
  departureRange: string;
};

/**
 * Fixed “Arrival Date” search window for Emma Search Reservations (inclusive).
 * Product rule: always use this range for arrival-driven search.
 */
export const EMMA_ARRIVAL_SEARCH_RANGE = '01.01.2025 - 31.12.2026';

/**
 * Accessible name of the top shell search field on Search Reservations — paste
 * PMS / Puzzel reservation numbers here.
 */
export const EMMA_SHELL_RESERVATION_SEARCHBOX_NAME =
  'Reservation, Room, Guest, Client, RR number';

const RANGE_SEP = ' - ';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `DD.MM.YYYY` using UTC calendar parts (stable for parsed calendar dates). */
function formatEmmaDay(d: Date): string {
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

function singleDayRange(d: Date): string {
  const s = formatEmmaDay(d);
  return `${s}${RANGE_SEP}${s}`;
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/**
 * Parse `YYYY-MM-DD` or `D.M.YYYY` / `DD.MM.YYYY` (verbatim from AI / guests).
 */
export function parseStayDateToUtcNoon(raw: string | null | undefined): Date | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(Date.UTC(y, m, d, 12, 0, 0));
  }

  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (de) {
    const d = Number(de[1]);
    const mo = Number(de[2]) - 1;
    const y = Number(de[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return new Date(Date.UTC(y, mo, d, 12, 0, 0));
  }

  return null;
}

/**
 * Build Emma Search Reservations date filters from AI `checkInDate` / `checkOutDate`.
 *
 * **Arrival** is always {@link EMMA_ARRIVAL_SEARCH_RANGE}.
 *
 * - If both parse: departure = check-out day range.
 * - If only check-in: check-out is inferred as **next calendar day** (typical 1-night).
 * - If only check-out: check-in is inferred as **previous calendar day**.
 * - If neither parses: returns `null` (caller uses
 *   {@link emmaSearchReservationDateFiltersWithTicketFallback}).
 */
export function emmaSearchReservationDateFilters(
  checkInDate: string | null | undefined,
  checkOutDate: string | null | undefined,
): EmmaReservationSearchDateFilters | null {
  let ci = parseStayDateToUtcNoon(checkInDate);
  let co = parseStayDateToUtcNoon(checkOutDate);

  if (!ci && co) {
    ci = addUtcDays(co, -1);
  }
  if (ci && !co) {
    co = addUtcDays(ci, 1);
  }
  if (!ci || !co) {
    return null;
  }

  return {
    arrivalRange: EMMA_ARRIVAL_SEARCH_RANGE,
    departureRange: singleDayRange(co),
  };
}

/**
 * Prefer precise stay dates from the AI; if they cannot be parsed, use the fixed
 * arrival window for **both** “Arrival Date” and “Departure Date” before **Go**.
 *
 * (`ticketReferenceDate` and `opts.spanDays` are kept for API compatibility; the
 * ticket-centred span is no longer used for Emma date fields.)
 *
 * @param ticketReferenceDate e.g. `PuzzelTicket.scrapedAt` from Prisma
 * @param opts.spanDays ignored (reserved for future use)
 */
export function emmaSearchReservationDateFiltersWithTicketFallback(
  checkInDate: string | null | undefined,
  checkOutDate: string | null | undefined,
  ticketReferenceDate: Date,
  opts?: { spanDays?: number },
): EmmaReservationSearchDateFilters {
  void ticketReferenceDate;
  void opts;

  const precise = emmaSearchReservationDateFilters(checkInDate, checkOutDate);
  if (precise) {
    return precise;
  }

  return {
    arrivalRange: EMMA_ARRIVAL_SEARCH_RANGE,
    departureRange: EMMA_ARRIVAL_SEARCH_RANGE,
  };
}
