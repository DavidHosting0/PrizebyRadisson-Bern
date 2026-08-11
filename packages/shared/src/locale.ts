export const SUPPORTED_LOCALES = ['de', 'en', 'pt', 'es', 'tr', 'uk'] as const;
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
  if (fb.startsWith('es')) return 'es';
  if (fb.startsWith('tr')) return 'tr';
  if (fb.startsWith('uk') || fb.startsWith('ua')) return 'uk';
  if (fb.startsWith('de')) return 'de';
  return DEFAULT_LOCALE;
}

/** BCP 47 tag for Intl formatters (Swiss hotel context where applicable). */
export function intlLocale(locale: SupportedLocale): string {
  switch (locale) {
    case 'en':
      return 'en-CH';
    case 'pt':
      return 'pt-PT';
    case 'es':
      return 'es-ES';
    case 'tr':
      return 'tr-TR';
    case 'uk':
      return 'uk-UA';
    default:
      return 'de-CH';
  }
}

/** Short uppercase label shown in the language control. */
export function localeAbbrev(locale: SupportedLocale): string {
  return locale.toUpperCase();
}

/** English language name for LLM translation prompts. */
export function localeLangName(locale: SupportedLocale): string {
  switch (locale) {
    case 'en':
      return 'English';
    case 'pt':
      return 'Portuguese';
    case 'es':
      return 'Spanish';
    case 'tr':
      return 'Turkish';
    case 'uk':
      return 'Ukrainian';
    default:
      return 'German';
  }
}
