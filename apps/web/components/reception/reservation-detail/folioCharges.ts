import type { ReservationFolioCharge } from '@housekeeping/shared';
import { normalizeFolioCharge } from '@housekeeping/shared';

/** @deprecated Use normalizeFolioCharge from @housekeeping/shared */
export function normalizeFolioChargeFromRow(
  row: Record<string, unknown>,
  parentFolioId?: string,
): ReservationFolioCharge {
  return normalizeFolioCharge(row, parentFolioId);
}
