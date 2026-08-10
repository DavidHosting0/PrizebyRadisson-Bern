export const SUPPORTED_LOCALES = ['de', 'en', 'pt'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'de';

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(
  preferred?: string | null,
  fallback?: string | null,
): SupportedLocale {
  if (isSupportedLocale(preferred)) return preferred;
  if (isSupportedLocale(fallback)) return fallback;
  const fb = fallback?.toLowerCase() ?? '';
  if (fb.startsWith('en')) return 'en';
  if (fb.startsWith('pt')) return 'pt';
  if (fb.startsWith('de')) return 'de';
  return DEFAULT_LOCALE;
}

/** BCP 47 tag for Intl formatters (Swiss hotel context). */
export function intlLocale(locale: SupportedLocale): string {
  if (locale === 'en') return 'en-CH';
  if (locale === 'pt') return 'pt-PT';
  return 'de-CH';
}

/** Short uppercase label shown in the language control (DE / EN / PT). */
export function localeAbbrev(locale: SupportedLocale): string {
  return locale.toUpperCase();
}
