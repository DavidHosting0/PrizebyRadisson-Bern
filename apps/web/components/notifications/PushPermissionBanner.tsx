'use client';

import { useTranslations } from 'next-intl';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';

export function PushPermissionBanner() {
  const t = useTranslations('notifications');
  const { showBanner, canEnable, iosNeedsInstall, permission, busy, error, subscribe } =
    usePushNotifications();

  if (!showBanner) return null;

  let message = t('pushBannerMessage');
  if (iosNeedsInstall) {
    message = t('pushIosInstallHint');
  } else if (permission === 'denied') {
    message = t('pushDeniedHint');
  } else if (error === 'vapid') {
    message = t('pushServerUnavailable');
  }

  return (
    <div className="border-b border-action/20 bg-action-muted/50 px-4 py-2">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink">{message}</p>
        {canEnable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void subscribe()}
            className="shrink-0 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {t('enableNotifications')}
          </button>
        )}
      </div>
    </div>
  );
}
