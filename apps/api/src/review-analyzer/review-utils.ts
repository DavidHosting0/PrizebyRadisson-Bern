import { createHash } from 'node:crypto';

/** Shared Playwright mutex so Puzzel and Review Analyzer never run Chromium concurrently. */
let chain: Promise<void> = Promise.resolve();

export async function withPlaywrightMutex<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = chain;
  chain = chain.then(() => next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function hashReviewContent(parts: {
  score: number;
  positiveText?: string | null;
  negativeText?: string | null;
  fullText: string;
  reviewedAt: string;
}): string {
  const h = createHash('sha256');
  h.update(
    [
      String(parts.score),
      parts.positiveText ?? '',
      parts.negativeText ?? '',
      parts.fullText,
      parts.reviewedAt,
    ].join('\n'),
  );
  return h.digest('hex');
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'topic';
}

export function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function monthsAgoUtc(months: number, from = new Date()): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export function isoWeekParts(d: Date): { year: number; week: number; weekStart: Date } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return { year: date.getUTCFullYear(), week, weekStart: startOfUtcDay(weekStart) };
}
