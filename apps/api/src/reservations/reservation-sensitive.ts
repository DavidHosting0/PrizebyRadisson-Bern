import { Logger } from '@nestjs/common';
import type { SecretCipherService } from '../common/crypto/secret-cipher.service';

/** Fields stored AES-GCM encrypted inside ReservationSnapshot.sensitiveEnc. */
export type ReservationSensitivePayload = {
  mainGuestName: string | null;
  mainGuestId: string | null;
  mainClientName: string | null;
  cardHolder: string | null;
  creditCard: string | null;
  cardExpiry: string | null;
  preAuthAmount: string | null;
  vipDesc: string | null;
  groupName: string | null;
  groupId: string | null;
  bookingFileId: string | null;
  companyName: string | null;
  travelAgent: string | null;
  rateCode: string | null;
  sourceCode: string | null;
  marketCode: string | null;
  balance: string | null;
  comments: string | null;
  draftStatus: string | null;
  draftLockedBy: string | null;
  stays: string | null;
  guests: string | null;
  ciStatusSigned: boolean;
  stayover: boolean;
  noMove: boolean;
  originalRoomType: string | null;
  roomTypeUpg: string | null;
  numPax2: number | null;
  numPax3: number | null;
  numPax4: number | null;
  checkInQDate: string | null;
  expectedDepartureTime: string | null;
  emmaStatus: string | null;
  ocoDone: boolean;
};

const PAN_LIKE = /^\d{13,19}$/;

export function sanitizePaymentField(
  field: 'creditCard' | 'cardHolder' | 'cardExpiry',
  value: string | null,
  log: Logger,
  reservationId: string,
): string | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  if (field === 'creditCard') {
    const digits = v.replace(/\s/g, '');
    if (PAN_LIKE.test(digits)) {
      log.warn(
        `[Reservations] Dropped suspected full PAN for ${reservationId} — not stored in PrizeBern`,
      );
      return null;
    }
  }
  return v;
}

export function buildSensitivePayload(
  row: Record<string, unknown>,
  log: Logger,
): ReservationSensitivePayload {
  const reservationId = String(row.ReservationId ?? '');
  const str = (k: string): string | null => {
    const v = row[k];
    if (v == null || v === '') return null;
    return String(v).trim() || null;
  };
  const num = (k: string): number | null => {
    const v = row[k];
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };
  const bool = (k: string): boolean => row[k] === true || row[k] === 'true';

  return {
    mainGuestName: str('MainGuestName'),
    mainGuestId: str('MainGuestId'),
    mainClientName: str('MainClientName'),
    cardHolder: sanitizePaymentField('cardHolder', str('CardHolder'), log, reservationId),
    creditCard: sanitizePaymentField('creditCard', str('CreditCard'), log, reservationId),
    cardExpiry: sanitizePaymentField('cardExpiry', str('CardExpiry'), log, reservationId),
    preAuthAmount: str('PreAuthAmount'),
    vipDesc: str('VipDesc'),
    groupName: str('GroupName'),
    groupId: str('GroupId'),
    bookingFileId: str('BookingFileId'),
    companyName: str('CompanyName'),
    travelAgent: str('TravelAgent'),
    rateCode: str('RateCode') ?? str('Rate'),
    sourceCode: str('SourceCode') ?? str('SourceOfBusiness'),
    marketCode: str('MarketCode') ?? str('MarketSegment'),
    balance: str('Balance') ?? str('TotalAmountDueFolios'),
    comments: str('Comments') ?? str('Remarks'),
    draftStatus: str('Draft/Status') ?? str('DraftStatus'),
    draftLockedBy: str('Draft/LockedByUserFullName') ?? str('DraftLockedByUserFullName'),
    stays: str('Stays'),
    guests: str('Guests'),
    ciStatusSigned: bool('CIStatusSigned'),
    stayover: bool('Stayover'),
    noMove: bool('NoMove'),
    originalRoomType: str('OriginalRoomType'),
    roomTypeUpg: str('RoomTypeUpg'),
    numPax2: num('NumPax2'),
    numPax3: num('NumPax3'),
    numPax4: num('NumPax4'),
    checkInQDate: parseEmmaDateToIso(row.CheckInQDate),
    expectedDepartureTime: formatEmmaTime(str('ExpectedDepartureTime')),
    emmaStatus: str('Status'),
    ocoDone: bool('OCOdone') || bool('OCIdone'),
  };
}

/** SAP time "120000" → "12:00"; "000000" → null. */
export function formatEmmaTime(value: string | null): string | null {
  if (!value?.trim()) return null;
  const s = value.trim();
  if (s === '000000') return null;
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
}

export function encryptSensitivePayload(
  cipher: SecretCipherService,
  payload: ReservationSensitivePayload,
): string {
  return cipher.encrypt(JSON.stringify(payload));
}

export function decryptSensitivePayload(
  cipher: SecretCipherService,
  sensitiveEnc: string,
): ReservationSensitivePayload | null {
  const plain = cipher.decryptSafe(sensitiveEnc);
  if (!plain) return null;
  try {
    return JSON.parse(plain) as ReservationSensitivePayload;
  } catch {
    return null;
  }
}

/** Parse SAP OData `/Date(ms)/` or ISO date strings. */
export function parseEmmaDateToIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const m = /\/Date\((-?\d+)\)\//.exec(v);
    if (m) return new Date(parseInt(m[1], 10)).toISOString();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Date-only for Prisma @db.Date columns (hotel local calendar day). */
export function parseEmmaDateOnly(v: unknown, timeZone = 'Europe/Zurich'): Date | null {
  const iso = parseEmmaDateToIso(v);
  if (!iso) return null;
  const local = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
  return dateOnlyFromIso(local);
}

export function todayIsoDate(timeZone = 'Europe/Zurich'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** UTC midnight for a YYYY-MM-DD string (matches Prisma @db.Date storage). */
export function dateOnlyFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
