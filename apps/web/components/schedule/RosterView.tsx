'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { formatUserWithTitlePrefix, userTitlePrefixLabel } from '@/lib/userTitlePrefix';
import { useLocale } from '@/lib/locale-context';
import { formatDate as formatLocaleDate, formatTime as formatLocaleTime } from '@/lib/format-locale';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type RosterShift = {
  id: string;
  startsAt: string;
  endsAt: string;
  source: string;
  label: string | null;
  color: string | null;
};

type RosterEntry = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    titlePrefix: string;
    avatarUrl: string | null;
  };
  shifts: RosterShift[];
};

type RosterPayload = {
  from: string;
  to: string;
  entries: RosterEntry[];
};

type Range = { id: string; label: string; date: string; days: number };

const ROLE_COLORS: Record<string, string> = {
  RECEPTION: 'bg-sky-100 text-sky-900 border-sky-200',
  HOUSEKEEPER: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  SUPERVISOR: 'bg-violet-100 text-violet-900 border-violet-200',
  TECHNICIAN: 'bg-amber-100 text-amber-900 border-amber-200',
  ADMIN: 'bg-rose-100 text-rose-900 border-rose-200',
};

const ROLE_COLORS_DARK: Record<string, string> = {
  RECEPTION: 'bg-sky-500/15 text-sky-200 border-sky-500/30',
  HOUSEKEEPER: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  SUPERVISOR: 'bg-violet-500/15 text-violet-200 border-violet-500/30',
  TECHNICIAN: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  ADMIN: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
};

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildRanges(t: (key: string) => string): Range[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return [
    { id: 'today', label: t('today'), date: toDateKey(today), days: 1 },
    { id: 'tomorrow', label: t('tomorrow'), date: toDateKey(tomorrow), days: 1 },
    { id: 'week', label: t('thisWeek'), date: toDateKey(today), days: 7 },
    { id: 'fortnight', label: t('fortnight'), date: toDateKey(today), days: 14 },
  ];
}

const ROSTER_TZ = 'Europe/Zurich';

function formatTime(iso: string, locale: 'de' | 'en') {
  return formatLocaleTime(iso, locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ROSTER_TZ,
  });
}

function formatDayLabel(iso: string, locale: 'de' | 'en') {
  return formatLocaleDate(iso, locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: ROSTER_TZ,
  });
}

function durationHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export function RosterView({
  tone = 'light',
  onEnterMobile,
}: {
  tone?: 'light' | 'dark';
  onEnterMobile?: () => void;
}) {
  const dark = tone === 'dark';
  const t = useTranslations('schedule');
  const tCommon = useTranslations('common');
  const { locale } = useLocale();
  const ranges = useMemo(() => buildRanges((key) => t(key as 'today')), [t]);
  const [activeId, setActiveId] = useState<string>(ranges[0].id);
  const range = ranges.find((r) => r.id === activeId) ?? ranges[0];

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['roster', range.date, range.days],
    queryFn: () =>
      api<RosterPayload>(`/shifts/roster?date=${range.date}&days=${range.days}`),
    refetchInterval: 60_000,
  });

  const entries = data?.entries ?? [];
  const showDayHeader = range.days > 1;

  const content = (
    <div
      className={clsx(
        'mx-auto w-full max-w-5xl space-y-6',
        dark ? 'px-4 py-4 md:px-6 md:py-6' : 'px-4 py-6',
      )}
    >
      {!dark && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Wer arbeitet wann. Wird alle 15 Minuten von Mirus NEO synchronisiert.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
              disabled={isRefetching}
            >
              {isRefetching ? tCommon('loading') : tCommon('retry')}
            </button>
          </div>
        </header>
      )}

      {dark && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-sidebar-border bg-transparent px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
            disabled={isRefetching}
          >
            {isRefetching ? tCommon('loading') : tCommon('retry')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ranges.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setActiveId(r.id)}
            className={
              dark
                ? r.id === activeId
                  ? 'rounded-full bg-action px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded-full border border-sidebar-border bg-transparent px-3 py-1.5 text-sm font-medium text-sidebar-muted hover:bg-white/10 hover:text-white'
                : r.id === activeId
                  ? 'rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-muted'
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <p
          className={clsx(
            'rounded-xl px-4 py-6 text-sm',
            dark ? clsx(APP_DARK_CARD, 'text-sidebar-muted') : 'border border-border bg-surface text-ink-muted',
          )}
        >
          {t('loading')}
        </p>
      )}

      {isError && (
        <p
          className={clsx(
            'rounded-xl px-4 py-3 text-sm',
            dark
              ? 'border border-rose-500/30 bg-rose-500/10 text-rose-200'
              : 'border border-rose-200 bg-rose-50 text-rose-900',
          )}
        >
          {t('loadError')}: {(error as Error).message}
        </p>
      )}

      {!isLoading && !isError && entries.length === 0 && (
        <div
          className={clsx(
            'rounded-2xl px-6 py-10 text-center',
            dark
              ? 'border border-dashed border-sidebar-border/60 bg-black/10'
              : 'border border-dashed border-border bg-surface',
          )}
        >
          <p className={clsx('text-base font-medium', dark ? 'text-white' : 'text-ink')}>{t('noShifts')}</p>
          <p className={clsx('mt-1 text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
            Sobald Mirus synchronisiert ist und Mitarbeiter zugeordnet sind, erscheinen
            sie hier. Admins können das unter „Integrationen" einrichten.
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.user.id}
              className={clsx(
                'overflow-hidden',
                dark ? APP_DARK_CARD : 'rounded-2xl border border-border bg-surface shadow-card',
              )}
            >
              <div className="flex flex-wrap items-start gap-4 px-4 py-3">
                <Avatar name={entry.user.name} url={entry.user.avatarUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <p className={clsx('truncate text-sm font-semibold', dark ? 'text-white' : 'text-ink')}>
                    {formatUserWithTitlePrefix(entry.user.name, entry.user.titlePrefix)}
                  </p>
                  <p className={clsx('truncate text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                    {userTitlePrefixLabel(entry.user.titlePrefix) || entry.user.role}
                  </p>
                </div>
                <span
                  className={
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium ' +
                    (dark
                      ? (ROLE_COLORS_DARK[entry.user.role] ?? 'border-sidebar-border bg-white/10 text-sidebar-muted')
                      : (ROLE_COLORS[entry.user.role] ?? 'border-border bg-surface-muted text-ink-muted'))
                  }
                >
                  {entry.user.role}
                </span>
              </div>
              <ul
                className={clsx(
                  'border-t',
                  dark ? 'divide-y divide-sidebar-border/40 border-sidebar-border/60' : 'divide-y divide-border border-border',
                )}
              >
                {entry.shifts.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    {showDayHeader && (
                      <span className={clsx('min-w-[6.5rem] font-medium', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                        {formatDayLabel(s.startsAt, locale)}
                      </span>
                    )}
                    <span className={clsx('font-mono', dark ? 'text-white' : 'text-ink')}>
                      {formatTime(s.startsAt, locale)} – {formatTime(s.endsAt, locale)}
                    </span>
                    <span className={clsx('text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                      ({durationHours(s.startsAt, s.endsAt)} h)
                    </span>
                    {s.label && (
                      <span
                        className={clsx(
                          'rounded-md px-2 py-0.5 text-xs font-medium',
                          dark ? 'bg-white/10 text-white' : 'bg-surface-muted text-ink',
                        )}
                        style={s.color ? { backgroundColor: s.color, color: '#fff' } : undefined}
                      >
                        {s.label}
                      </span>
                    )}
                    {s.source !== 'mirus' && s.source !== 'favur' && (
                      <span
                        className={clsx(
                          'ml-auto text-[11px] uppercase tracking-wide',
                          dark ? 'text-sidebar-muted' : 'text-ink-muted',
                        )}
                      >
                        {s.source}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (dark) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <AppPageChrome
          title={t('title')}
          description="Wer arbeitet wann. Wird alle 15 Minuten von Mirus NEO synchronisiert."
          actions={<AppChromeTools onEnterMobile={onEnterMobile} />}
        />
        <AppPageBody>{content}</AppPageBody>
      </div>
    );
  }

  return content;
}
