export const SUPPORTED_LOCALES = ['de', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'de';

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === 'de' || value === 'en';
}

export function resolveLocale(
  preferred?: string | null,
  fallback?: string | null,
): SupportedLocale {
  if (isSupportedLocale(preferred)) return preferred;
  if (isSupportedLocale(fallback)) return fallback;
  if (fallback?.toLowerCase().startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

/** BCP 47 tag for Intl formatters (Swiss variants). */
export function intlLocale(locale: SupportedLocale): string {
  return locale === 'en' ? 'en-CH' : 'de-CH';
}
