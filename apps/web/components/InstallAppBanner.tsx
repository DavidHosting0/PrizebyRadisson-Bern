'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';

const DISMISS_KEY = 'hk_install_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallAppBanner() {
  const { user, loading } = useAuth();
  const t = useTranslations('installApp');
  const tCommon = useTranslations('common');
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === 'undefined') return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const iosDevice = isIos();
    if (!mobile && !iosDevice) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBip);

    setIos(iosDevice);
    if (iosDevice || mobile) setVisible(true);

    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, [loading, user]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }, []);

  const installAndroid = useCallback(async () => {
    if (!installEvt) return;
    setInstalling(true);
    try {
      await installEvt.prompt();
      await installEvt.userChoice;
      dismiss();
    } finally {
      setInstalling(false);
    }
  }, [installEvt, dismiss]);

  if (loading || !user || !visible) return null;

  return (
    <div
      className={clsx(
        'fixed bottom-[calc(5.5rem+var(--safe-bottom))] left-3 right-3 z-50 mx-auto max-w-md',
        'rounded-xl border border-border bg-surface px-4 py-3 shadow-lift',
      )}
      role="region"
      aria-label={t('title')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t('title')}</p>
          {ios ? (
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t('iosHint')}</p>
          ) : installEvt ? (
            <p className="mt-1 text-xs text-ink-muted">{t('androidPrompt')}</p>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">{t('chromeHint')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink"
          aria-label={tCommon('close')}
        >
          ✕
        </button>
      </div>
      {installEvt && !ios && (
        <button
          type="button"
          onClick={() => void installAndroid()}
          disabled={installing}
          className="mt-3 w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {installing ? t('installing') : t('installNow')}
        </button>
      )}
    </div>
  );
}
