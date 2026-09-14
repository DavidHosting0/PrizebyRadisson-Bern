import { useEffect, useMemo, useState } from 'react';
import { intlLocale, resolveLocale, type SupportedLocale } from '@housekeeping/shared';
import { getMessages, loadExtensionLocale, persistPreferredLocale, type ExtensionMessages } from '@/i18n/core';
import { useAuth } from '@/lib/auth-context';

/** Messages for the signed-in user's preferredLocale (or browser/storage fallback). */
export function useI18n(): {
  m: ExtensionMessages;
  locale: SupportedLocale;
  intl: string;
} {
  const { user } = useAuth();
  const [fallback, setFallback] = useState<SupportedLocale>(() =>
    resolveLocale(undefined, typeof navigator !== 'undefined' ? navigator.language : 'de'),
  );

  useEffect(() => {
    if (user?.preferredLocale) {
      const resolved = resolveLocale(user.preferredLocale);
      void persistPreferredLocale(resolved);
      return;
    }
    void loadExtensionLocale().then(setFallback);
  }, [user?.preferredLocale]);

  const locale = useMemo(
    () => resolveLocale(user?.preferredLocale, fallback),
    [user?.preferredLocale, fallback],
  );

  return {
    m: getMessages(locale),
    locale,
    intl: intlLocale(locale),
  };
}

/** For screens that may not sit under AuthProvider — rare; prefer useI18n. */
export function useMessagesOnly(preferredLocale?: string | null): ExtensionMessages {
  return getMessages(preferredLocale);
}
