'use client';

import { usePushNotifications } from '@/lib/hooks/usePushNotifications';

export function PushPermissionBanner() {
  const { canPrompt, busy, subscribe } = usePushNotifications();

  if (!canPrompt) return null;

  return (
    <div className="border-b border-action/20 bg-action-muted/50 px-4 py-2">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink">Enable browser notifications for new requests and mentions.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void subscribe()}
          className="shrink-0 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Enable notifications
        </button>
      </div>
    </div>
  );
}
