/** Parse EMMA numeric strings (e.g. "380.480000") to number. */
export function parseEmmaNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format EMMA amounts without spurious trailing zeros (380.480000 → 380,48).
 * Uses de-CH locale (comma decimal separator).
 */
export function formatEmmaAmount(value: unknown, currency?: string | null): string | null {
  if (value == null || value === '') return null;
  const n = parseEmmaNumber(value);
  if (n == null) {
    const s = String(value).trim();
    return s || null;
  }
  const formatted = new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(n);
  const cur = currency?.trim();
  return cur ? `${formatted} ${cur}` : formatted;
}

export function odataResults(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  const results = (value as { results?: unknown[] }).results;
  if (!Array.isArray(results)) return [];
  return results.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object');
}

export function folioDisplayNumber(folioId: unknown): string {
  const id = String(folioId ?? '').trim();
  if (!id) return '—';
  const n = parseInt(id, 10);
  return Number.isFinite(n) ? String(n) : id;
}

export function folioTitle(folio: Record<string, unknown>): string {
  const num = folioDisplayNumber(folio.Id);
  const holder = String(folio.NameHolder ?? '').trim();
  if (holder) return `Folio ${num} — ${holder}`;
  return `Folio ${num} (no holder selected)`;
}

export function folioCurrency(folio: Record<string, unknown>, fallback?: string | null): string {
  return String(folio.Currency ?? fallback ?? '').trim();
}
