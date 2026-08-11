export const locales = ['de', 'en', 'pt', 'es', 'tr', 'uk'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'de';
