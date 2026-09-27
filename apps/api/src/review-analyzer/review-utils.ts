import { createHash } from 'node:crypto';

/** Shared Playwright mutex so Puzzel and Review Analyzer never run Chromium concurrently. */
let chain: Promise<void> = Promise.resolve();
let mutexBusy = false;
let mutexWaiters = 0;

export function isPlaywrightMutexBusy() {
  return mutexBusy;
}

export async function withPlaywrightMutex<T>(
  fn: () => Promise<T>,
  onWaiting?: (msg: string) => void | Promise<void>,
): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = chain;
  chain = chain.then(() => next);
  if (mutexBusy) {
    mutexWaiters++;
    await onWaiting?.(
      `waiting for Playwright lock (${mutexWaiters} waiting — Puzzel or another import may be using Chromium)…`,
    );
  }
  await prev;
  mutexWaiters = Math.max(0, mutexWaiters - 1);
  mutexBusy = true;
  try {
    return await fn();
  } finally {
    mutexBusy = false;
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

export type ReviewPeriodKey = 'week' | 'month' | 'year' | '30d' | '90d' | 'all';

export const REVIEW_PERIOD_KEYS: ReviewPeriodKey[] = ['week', 'month', 'year', '30d', '90d', 'all'];

/** Resolve a named period + matching previous window for trend comparison. */
export function resolveReviewPeriod(
  period: ReviewPeriodKey = 'month',
  now = new Date(),
): {
  key: ReviewPeriodKey;
  from: Date | null;
  to: Date;
  prevFrom: Date | null;
  prevTo: Date | null;
  label: string;
} {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );

  if (period === 'all') {
    return {
      key: 'all',
      from: null,
      to,
      prevFrom: null,
      prevTo: null,
      label: 'All time',
    };
  }

  if (period === 'week') {
    const { weekStart } = isoWeekParts(now);
    const from = weekStart;
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(from);
    prevFrom.setUTCDate(prevFrom.getUTCDate() - 7);
    return {
      key: 'week',
      from,
      to,
      prevFrom,
      prevTo,
      label: 'This week',
    };
  }

  if (period === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return {
      key: 'month',
      from,
      to,
      prevFrom,
      prevTo,
      label: 'This month',
    };
  }

  if (period === 'year') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    return {
      key: 'year',
      from,
      to,
      prevFrom,
      prevTo,
      label: 'This year',
    };
  }

  const days = period === '90d' ? 90 : 30;
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days);
  return {
    key: period,
    from,
    to,
    prevFrom,
    prevTo,
    label: period === '90d' ? 'Last 90 days' : 'Last 30 days',
  };
}
