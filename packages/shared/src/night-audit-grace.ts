/** Hotel local night-audit window when EMMA may be unreachable briefly. */
export const NIGHT_AUDIT_TIMEZONE = 'Europe/Zurich';
export const NIGHT_AUDIT_START_HOUR = 2;
export const NIGHT_AUDIT_END_HOUR = 7;
/** Expected max EMMA outage during night audit (minutes). */
export const NIGHT_AUDIT_GRACE_MS = 30 * 60 * 1000;

export function hotelLocalHour(now: Date, timeZone = NIGHT_AUDIT_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const n = hour != null ? parseInt(hour, 10) : Number.NaN;
  return Number.isFinite(n) ? n : now.getUTCHours();
}

/** True between 02:00 and 06:59 hotel local time (night audit). */
export function isNightAuditWindow(now: Date, timeZone = NIGHT_AUDIT_TIMEZONE): boolean {
  const hour = hotelLocalHour(now, timeZone);
  return hour >= NIGHT_AUDIT_START_HOUR && hour < NIGHT_AUDIT_END_HOUR;
}

/**
 * Suppress automatic backup activation during night audit when EMMA has been
 * down for less than {@link NIGHT_AUDIT_GRACE_MS}.
 */
export function shouldSuppressBackupForNightAudit(
  outageSinceIso: string | null | undefined,
  now: Date = new Date(),
  timeZone = NIGHT_AUDIT_TIMEZONE,
): boolean {
  if (!outageSinceIso?.trim()) return false;
  if (!isNightAuditWindow(now, timeZone)) return false;
  const since = new Date(outageSinceIso).getTime();
  if (Number.isNaN(since)) return false;
  return now.getTime() - since < NIGHT_AUDIT_GRACE_MS;
}

export type NightAuditGraceInput = {
  pushActive: boolean;
  pushSince: string | null;
  reservationSyncError: boolean;
  reservationSyncErrorSince: string | null;
  manual: boolean;
  now?: Date;
};

export type NightAuditGraceResult = {
  reasons: Array<'push' | 'reservation_sync' | 'manual'>;
  since: string | null;
  active: boolean;
  manual: boolean;
  nightAuditGrace: boolean;
};

/** Compute backup mode with night-audit tolerance for automatic failure signals. */
export function resolveBackupModeWithNightAudit(
  input: NightAuditGraceInput,
): NightAuditGraceResult {
  const now = input.now ?? new Date();
  const reasons: Array<'push' | 'reservation_sync' | 'manual'> = [];
  const sinceCandidates: string[] = [];
  let nightAuditGrace = false;

  if (input.pushActive) {
    if (shouldSuppressBackupForNightAudit(input.pushSince, now)) {
      nightAuditGrace = true;
    } else {
      reasons.push('push');
      if (input.pushSince) sinceCandidates.push(input.pushSince);
    }
  }

  if (input.reservationSyncError) {
    if (shouldSuppressBackupForNightAudit(input.reservationSyncErrorSince, now)) {
      nightAuditGrace = true;
    } else {
      reasons.push('reservation_sync');
      if (input.reservationSyncErrorSince) {
        sinceCandidates.push(input.reservationSyncErrorSince);
      }
    }
  }

  if (input.manual) {
    reasons.push('manual');
  }

  const since =
    sinceCandidates.length > 0
      ? sinceCandidates.sort((a, b) => a.localeCompare(b))[0]!
      : null;

  return {
    reasons,
    since,
    active: reasons.length > 0,
    manual: input.manual,
    nightAuditGrace,
  };
}
