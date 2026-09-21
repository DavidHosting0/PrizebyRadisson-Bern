import type { ArrivalCheckSource } from './arrival-check';

/**
 * Known OTA guest-mailbox hosts. Positive allowlist only — real guest emails
 * (gmail, bluewin, company domains, …) never match and are never cleared.
 */
export const OTA_PLACEHOLDER_EMAIL_DOMAINS = [
  'guest.booking.com',
  'guest.agoda.com',
  'guest.expedia.com',
  'guest.hotels.com',
  'guest.hr.expediapartnercentral.com',
  'm.expediapartnercentral.com',
  'guest.ctrip.com',
  'guest.trip.com',
] as const;

/** Clients whose guest emails must never be auto-cleared. */
export const ARRIVAL_CHECK_EMAIL_CLEAR_PROTECTED_SOURCES: readonly ArrivalCheckSource[] = [
  'RADISSON',
  'DIRECT_GUEST',
  'DAYUSE',
  'BCD_TRAVEL',
  'ATG_TRAVEL',
  'APPSMEDIA_IOS',
] as const;

/** OTAs where placeholder emails are expected and may be cleared. */
export const ARRIVAL_CHECK_EMAIL_CLEAR_OTA_SOURCES: readonly ArrivalCheckSource[] = [
  'BOOKING',
  'EXPEDIA',
  'AGODA',
  'CTRIP',
  'TRIVAGO',
] as const;

function emailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

/**
 * True when the address is a known OTA guest / proxy mailbox (e.g. Booking
 * `name.123456@guest.booking.com`). Never true for ordinary personal emails.
 */
export function isOtaPlaceholderGuestEmail(email: string | null | undefined): boolean {
  if (email == null) return false;
  const domain = emailDomain(String(email));
  if (!domain) return false;

  for (const known of OTA_PLACEHOLDER_EMAIL_DOMAINS) {
    if (domain === known || domain.endsWith(`.${known}`)) return true;
  }

  // Catch related Expedia Partner Central guest hosts without listing every subdomain.
  if (domain.endsWith('.expediapartnercentral.com') && domain.includes('guest')) {
    return true;
  }

  return false;
}

/**
 * Arrival-check gate: clear only for OTA / OTHER when the mail is an allowlisted
 * placeholder. Protected clients (Radisson, Direct Guest, …) are never cleared.
 */
export function shouldClearGuestEmailForArrivalCheck(
  source: ArrivalCheckSource | null | undefined,
  email: string | null | undefined,
): boolean {
  if (!source) return false;
  if ((ARRIVAL_CHECK_EMAIL_CLEAR_PROTECTED_SOURCES as readonly string[]).includes(source)) {
    return false;
  }
  if (!isOtaPlaceholderGuestEmail(email)) return false;

  if ((ARRIVAL_CHECK_EMAIL_CLEAR_OTA_SOURCES as readonly string[]).includes(source)) {
    return true;
  }
  // Undetected OTA often lands as OTHER — still clear when domain is allowlisted.
  return source === 'OTHER';
}

/** Pick main guest Mail / GuestId from an EMMA detail guest list. */
export function pickMainGuestMail(
  guests: Record<string, unknown>[] | null | undefined,
): { guestId: string; mail: string | null } | null {
  if (!guests?.length) return null;

  const isTruthy = (v: unknown) =>
    v === true || v === 'true' || v === 'X' || v === 'x' || v === 1 || v === '1';

  const main =
    guests.find((g) => isTruthy(g.MainGuest)) ??
    guests.find((g) => String(g.GuestId ?? '').trim() === '01') ??
    guests[0];

  if (!main) return null;
  const guestId = String(main.GuestId ?? '01').trim() || '01';
  const raw = main.Mail;
  const mail =
    raw == null || raw === ''
      ? null
      : String(raw).trim() || null;
  return { guestId, mail };
}
