/**
 * Shared EMMA date parsing helpers (local timezone for "today").
 */

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/** Parse EMMA dates like "Mon, Sep 14, 2026", "14.09.2026", "2026-09-14". */
export function parseEmmaDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const eu = s.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (eu) {
    return `${eu[3]}-${eu[2].padStart(2, '0')}-${eu[1].padStart(2, '0')}`;
  }

  // Mon, Sep 14, 2026  |  Sep 14, 2026  |  Tuesday, September 15, 2026
  const en = s.match(
    /(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/,
  );
  if (en) {
    const mm = MONTH_MAP[en[1].toLowerCase()];
    if (mm) return `${en[3]}-${mm}-${en[2].padStart(2, '0')}`;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (y >= 2000) return `${y}-${m}-${day}`;
  }
  return null;
}

/** Today's date in the local timezone (front-desk PC), YYYY-MM-DD. */
export function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDateToday(isoOrRaw: string | null | undefined): boolean {
  if (!isoOrRaw) return false;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(isoOrRaw) ? isoOrRaw : parseEmmaDate(isoOrRaw);
  return Boolean(iso && iso === localTodayIso());
}
