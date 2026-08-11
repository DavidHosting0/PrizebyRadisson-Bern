import { intlLocale, isSupportedLocale, type SupportedLocale } from '@housekeeping/shared';

function justNow(code: string): string {
  switch (code) {
    case 'de':
      return 'gerade eben';
    case 'pt':
      return 'agora mesmo';
    case 'es':
      return 'ahora mismo';
    case 'tr':
      return 'az önce';
    case 'uk':
      return 'щойно';
    default:
      return 'just now';
  }
}

export function formatAge(iso: string | null | undefined, locale: string = 'de'): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const code = locale.slice(0, 2).toLowerCase();

  if (diffMs < 0 || Math.floor(diffMs / 60_000) < 1) {
    return justNow(code);
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    switch (code) {
      case 'de':
        return `vor ${minutes} Min.`;
      case 'pt':
        return `há ${minutes} min`;
      case 'es':
        return `hace ${minutes} min`;
      case 'tr':
        return `${minutes} dk önce`;
      case 'uk':
        return `${minutes} хв тому`;
      default:
        return `${minutes} min ago`;
    }
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    switch (code) {
      case 'de':
        return `vor ${hours} Std.`;
      case 'pt':
        return `há ${hours} h`;
      case 'es':
        return `hace ${hours} h`;
      case 'tr':
        return `${hours} sa önce`;
      case 'uk':
        return `${hours} год тому`;
      default:
        return `${hours} h ago`;
    }
  }

  const days = Math.floor(hours / 24);
  switch (code) {
    case 'de':
      return `vor ${days} T.`;
    case 'pt':
      return `há ${days} d`;
    case 'es':
      return `hace ${days} d`;
    case 'tr':
      return `${days} g önce`;
    case 'uk':
      return `${days} д тому`;
    default:
      return `${days} d ago`;
  }
}

export function formatTimestamp(iso: string | null | undefined, locale: string = 'de'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const code = locale.slice(0, 2).toLowerCase();
  const tag = isSupportedLocale(code) ? intlLocale(code) : locale.startsWith('de') ? 'de-CH' : 'en-GB';
  return d.toLocaleString(tag, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
