export function formatAge(iso: string | null | undefined, locale = 'de'): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return locale.startsWith('de') ? 'gerade eben' : 'just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return locale.startsWith('de') ? 'gerade eben' : 'just now';
  if (minutes < 60) {
    return locale.startsWith('de') ? `vor ${minutes} Min.` : `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return locale.startsWith('de') ? `vor ${hours} Std.` : `${hours} h ago`;
  }

  const days = Math.floor(hours / 24);
  return locale.startsWith('de') ? `vor ${days} T.` : `${days} d ago`;
}

export function formatTimestamp(iso: string | null | undefined, locale = 'de'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale.startsWith('de') ? 'de-CH' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
