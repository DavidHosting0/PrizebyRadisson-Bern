export const locales = ['de', 'en', 'pt'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'de';
