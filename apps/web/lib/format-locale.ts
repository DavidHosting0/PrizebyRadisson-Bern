import { intlLocale, type SupportedLocale } from '@housekeeping/shared';

export function formatDateTime(
  value: Date | string | number,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString(intlLocale(locale), options);
}

export function formatDate(
  value: Date | string | number,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString(intlLocale(locale), options);
}

export function formatTime(
  value: Date | string | number,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString(intlLocale(locale), options);
}

export function formatCurrency(
  amount: number,
  locale: SupportedLocale,
  currency = 'CHF',
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}
