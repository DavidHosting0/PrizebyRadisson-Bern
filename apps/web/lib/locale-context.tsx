'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { NextIntlClientProvider } from 'next-intl';
import {
  DEFAULT_LOCALE,
  HOTEL_TIME_ZONE,
  resolveLocale,
  type SupportedLocale,
} from '@housekeeping/shared';
import deMessages from '@/messages/de.json';
import enMessages from '@/messages/en.json';
import ptMessages from '@/messages/pt.json';
import esMessages from '@/messages/es.json';
import trMessages from '@/messages/tr.json';
import ukMessages from '@/messages/uk.json';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

const COOKIE_KEY = 'hk_locale';
const MESSAGES: Record<SupportedLocale, typeof deMessages> = {
  de: deMessages,
  en: enMessages,
  pt: ptMessages,
  es: esMessages,
  tr: trMessages,
  uk: ukMessages,
};

type LocaleCtx = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
};

const LocaleContext = createContext<LocaleCtx | null>(null);

function readCookieLocale(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`${COOKIE_KEY}=([^;]+)`));
  return match?.[1] ?? null;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user, refreshMe } = useAuth();
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (typeof window === 'undefined') return DEFAULT_LOCALE;
    return resolveLocale(readCookieLocale(), navigator.language);
  });

  useEffect(() => {
    if (user?.preferredLocale) {
      const next = resolveLocale(user.preferredLocale);
      setLocaleState(next);
      document.cookie = `${COOKIE_KEY}=${next};path=/;max-age=31536000`;
      document.documentElement.lang = next;
    }
  }, [user?.preferredLocale]);

  const setLocale = useCallback(
    async (next: SupportedLocale) => {
      setLocaleState(next);
      document.cookie = `${COOKIE_KEY}=${next};path=/;max-age=31536000`;
      document.documentElement.lang = next;
      try {
        await api('/users/me/locale', {
          method: 'PATCH',
          body: JSON.stringify({ locale: next }),
        });
        await refreshMe();
      } catch {
        // keep local preference
      }
    },
    [refreshMe],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={MESSAGES[locale]}
        timeZone={HOTEL_TIME_ZONE}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale outside LocaleProvider');
  return ctx;
}
