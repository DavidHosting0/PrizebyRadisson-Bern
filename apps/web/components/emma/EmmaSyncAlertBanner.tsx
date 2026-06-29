'use client';

import { useEmmaIntegrationStatus } from '@/lib/hooks/useEmmaIntegrationStatus';

export function EmmaSyncAlertBanner() {
  const { active, message } = useEmmaIntegrationStatus();

  if (!active) return null;

  return (
    <div
      role="alert"
      className="fixed top-3 right-3 z-[60] max-w-sm rounded-lg border-2 border-rose-800 bg-rose-600 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lift"
    >
      {message}
    </div>
  );
}
