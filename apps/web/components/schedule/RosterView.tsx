'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { formatUserWithTitlePrefix, userTitlePrefixLabel } from '@/lib/userTitlePrefix';

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

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildRanges(): Range[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return [
    { id: 'today', label: 'Heute', date: formatDate(today), days: 1 },
    { id: 'tomorrow', label: 'Morgen', date: formatDate(tomorrow), days: 1 },
    { id: 'week', label: 'Diese Woche', date: formatDate(today), days: 7 },
    { id: 'fortnight', label: 'Nächste 14 Tage', date: formatDate(today), days: 14 },
  ];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-CH', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

function durationHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export function RosterView() {
  const ranges = useMemo(buildRanges, []);
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Schichtplan</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Wer arbeitet wann. Wird alle 15 Minuten von Favur synchronisiert.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
            disabled={isRefetching}
          >
            {isRefetching ? 'Lädt…' : 'Aktualisieren'}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {ranges.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setActiveId(r.id)}
            className={
              r.id === activeId
                ? 'rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-muted'
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-ink-muted">
          Schichten werden geladen…
        </p>
      )}

      {isError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Schichtplan konnte nicht geladen werden: {(error as Error).message}
        </p>
      )}

      {!isLoading && !isError && entries.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
          <p className="text-base font-medium text-ink">Keine Schichten in diesem Zeitraum.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Sobald Favur synchronisiert ist und Mitarbeiter zugeordnet sind, erscheinen
            sie hier. Admins können das unter „Integrationen → Favur" einrichten.
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.user.id}
              className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
            >
              <div className="flex flex-wrap items-start gap-4 px-4 py-3">
                <Avatar name={entry.user.name} url={entry.user.avatarUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {formatUserWithTitlePrefix(entry.user.name, entry.user.titlePrefix)}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {userTitlePrefixLabel(entry.user.titlePrefix) || entry.user.role}
                  </p>
                </div>
                <span
                  className={
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium ' +
                    (ROLE_COLORS[entry.user.role] ??
                      'border-border bg-surface-muted text-ink-muted')
                  }
                >
                  {entry.user.role}
                </span>
              </div>
              <ul className="divide-y divide-border border-t border-border">
                {entry.shifts.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    {showDayHeader && (
                      <span className="min-w-[6.5rem] font-medium text-ink-muted">
                        {formatDayLabel(s.startsAt)}
                      </span>
                    )}
                    <span className="font-mono text-ink">
                      {formatTime(s.startsAt)} – {formatTime(s.endsAt)}
                    </span>
                    <span className="text-xs text-ink-muted">
                      ({durationHours(s.startsAt, s.endsAt)} h)
                    </span>
                    {s.label && (
                      <span
                        className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink"
                        style={s.color ? { backgroundColor: s.color, color: '#fff' } : undefined}
                      >
                        {s.label}
                      </span>
                    )}
                    {s.source !== 'favur' && (
                      <span className="ml-auto text-[11px] uppercase tracking-wide text-ink-muted">
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
}
