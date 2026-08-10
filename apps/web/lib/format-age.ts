import { intlLocale, type SupportedLocale } from '@housekeeping/shared';

export function formatAge(iso: string | null | undefined, locale: string = 'de'): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const code = locale.slice(0, 2).toLowerCase();

  if (diffMs < 0) {
    if (code === 'de') return 'gerade eben';
    if (code === 'pt') return 'agora mesmo';
    return 'just now';
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    if (code === 'de') return 'gerade eben';
    if (code === 'pt') return 'agora mesmo';
    return 'just now';
  }
  if (minutes < 60) {
    if (code === 'de') return `vor ${minutes} Min.`;
    if (code === 'pt') return `há ${minutes} min`;
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    if (code === 'de') return `vor ${hours} Std.`;
    if (code === 'pt') return `há ${hours} h`;
    return `${hours} h ago`;
  }

  const days = Math.floor(hours / 24);
  if (code === 'de') return `vor ${days} T.`;
  if (code === 'pt') return `há ${days} d`;
  return `${days} d ago`;
}

export function formatTimestamp(iso: string | null | undefined, locale: string = 'de'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const code = (locale.slice(0, 2).toLowerCase() || 'de') as SupportedLocale;
  const tag =
    code === 'de' || code === 'en' || code === 'pt' ? intlLocale(code) : locale.startsWith('de') ? 'de-CH' : 'en-GB';
  return d.toLocaleString(tag, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
