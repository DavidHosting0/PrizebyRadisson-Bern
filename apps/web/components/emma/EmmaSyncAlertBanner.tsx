'use client';

import Link from 'next/link';
import { useEmmaIntegrationStatus } from '@/lib/hooks/useEmmaIntegrationStatus';

const REASON_LABELS: Record<string, string> = {
  push: 'Room sync push failed',
  reservation_sync: 'Reservation sync failed',
  manual: 'Manual backup mode',
};

export function EmmaSyncAlertBanner() {
  const { active, message, backupModeReasons, pendingCount } = useEmmaIntegrationStatus();

  if (!active) return null;

  const sublines = [
    ...backupModeReasons.map((r) => REASON_LABELS[r] ?? r),
    pendingCount > 0 ? `${pendingCount} pending push(es)` : null,
  ].filter(Boolean);

  return (
    <div
      role="alert"
      className="fixed top-3 right-3 z-[60] max-w-md animate-pulse rounded-lg border-4 border-rose-950 bg-rose-600 px-5 py-4 text-white shadow-[0_8px_32px_rgba(190,18,60,0.55)]"
    >
      <p className="text-base font-black uppercase leading-tight tracking-wider sm:text-lg">
        {message}
      </p>
      {sublines.length > 0 ? (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-rose-100">
          {sublines.join(' · ')}
        </p>
      ) : null}
      <Link
        href="/r/front-office/backup"
        className="mt-3 inline-block text-xs font-bold uppercase underline underline-offset-2 hover:text-rose-50"
      >
        Open backup overview
      </Link>
    </div>
  );
}
