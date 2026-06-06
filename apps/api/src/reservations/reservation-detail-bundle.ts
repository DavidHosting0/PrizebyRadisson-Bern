import type { ReservationEmmaDetailBundle } from '@housekeeping/shared';
import type { SecretCipherService } from '../common/crypto/secret-cipher.service';

export type { ReservationEmmaDetailBundle };

const PAN_LIKE = /^\d{13,19}$/;

function stripODataRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === '__metadata') continue;
    if (value && typeof value === 'object' && '__deferred' in (value as object)) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeGuestRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = stripODataRow(row);
  const card = out.CardNumber;
  if (typeof card === 'string') {
    const digits = card.replace(/\s/g, '');
    if (PAN_LIKE.test(digits)) delete out.CardNumber;
  }
  return out;
}

function sanitizeCreditCardRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = stripODataRow(row);
  delete out.Token;
  return out;
}

export function buildReservationDetailBundle(input: {
  reservation: Record<string, unknown>;
  guests: Record<string, unknown>[];
  creditCards: Record<string, unknown>[];
  preauthorizations: Record<string, unknown>[];
  roomList: Record<string, unknown>[];
  loyaltyBenefits: Record<string, unknown>[];
  policeRecords: Record<string, unknown>[];
  fetchedAt: Date;
}): ReservationEmmaDetailBundle {
  return {
    fetchedAt: input.fetchedAt.toISOString(),
    reservation: stripODataRow(input.reservation),
    guests: input.guests.map(sanitizeGuestRow),
    creditCards: input.creditCards.map(sanitizeCreditCardRow),
    preauthorizations: input.preauthorizations.map(stripODataRow),
    roomList: input.roomList.map(stripODataRow),
    loyaltyBenefits: input.loyaltyBenefits.map(stripODataRow),
    policeRecords: input.policeRecords.map(stripODataRow),
  };
}

export function encryptDetailBundle(
  cipher: SecretCipherService,
  bundle: ReservationEmmaDetailBundle,
): string {
  return cipher.encrypt(JSON.stringify(bundle));
}

export function decryptDetailBundle(
  cipher: SecretCipherService,
  detailEnc: string | null | undefined,
): ReservationEmmaDetailBundle | null {
  if (!detailEnc?.trim()) return null;
  const plain = cipher.decryptSafe(detailEnc);
  if (!plain) return null;
  try {
    return JSON.parse(plain) as ReservationEmmaDetailBundle;
  } catch {
    return null;
  }
}
