'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ReservationListItem, ReservationOverview } from '@housekeeping/shared';
import { api } from '@/lib/api';
import clsx from 'clsx';

type SortKey =
  | 'guest'
  | 'reservationId'
  | 'roomId'
  | 'arrivalDate'
  | 'roomType'
  | 'numPax'
  | 'vip'
  | 'creditCard';

type SortDir = 'asc' | 'desc';

function compareRows(a: ReservationListItem, b: ReservationListItem, key: SortKey): number {
  const str = (v: string | null | undefined) => (v ?? '').trim().toLocaleLowerCase('de-CH');
  const num = (v: number | null | undefined) => (v == null ? null : v);

  switch (key) {
    case 'guest':
      return str(a.mainGuestName).localeCompare(str(b.mainGuestName), 'de-CH');
    case 'reservationId':
      return str(a.reservationId).localeCompare(str(b.reservationId), 'de-CH', { numeric: true });
    case 'roomId': {
      const ra = str(a.roomId);
      const rb = str(b.roomId);
      if (!ra && !rb) return 0;
      if (!ra) return 1;
      if (!rb) return -1;
      return ra.localeCompare(rb, 'de-CH', { numeric: true });
    }
    case 'arrivalDate': {
      const da = a.arrivalDate || '';
      const db = b.arrivalDate || '';
      if (da !== db) return da.localeCompare(db);
      return (a.departureDate || '').localeCompare(b.departureDate || '');
    }
    case 'roomType':
      return str(a.roomType).localeCompare(str(b.roomType), 'de-CH');
    case 'numPax': {
      const pa = num(a.numPax);
      const pb = num(b.numPax);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    }
    case 'vip':
      return str(a.vipDesc || a.tier).localeCompare(str(b.vipDesc || b.tier), 'de-CH');
    case 'creditCard':
      return str(a.creditCard).localeCompare(str(b.creditCard), 'de-CH');
    default:
      return 0;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={clsx('inline-flex flex-col gap-px', active ? 'text-ink' : 'text-ink-muted/35')}>
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        aria-hidden
        className={clsx(active && dir === 'asc' && 'text-ink')}
      >
        <path d="M4 0L8 5H0z" fill="currentColor" />
      </svg>
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        aria-hidden
        className={clsx(active && dir === 'desc' && 'text-ink')}
      >
        <path d="M4 5L0 0h8z" fill="currentColor" />
      </svg>
    </span>
  );
}

function SortableTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th className={clsx('px-4 py-3 font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={clsx(
          'inline-flex items-center gap-1.5 text-left text-[11px] uppercase tracking-wide transition-colors',
          active ? 'text-ink' : 'text-ink-muted hover:text-ink',
        )}
      >
        {label}
        <SortIcon active={active} dir={sortDir} />
      </button>
    </th>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[7rem] rounded-lg border border-border/80 bg-surface px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-ink">{value}</p>
    </div>
  );
}

export default function ReceptionArrivalsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('guest');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const listQuery = useQuery({
    queryKey: ['arrivals', search],
    queryFn: () => {
      const params = new URLSearchParams({ tab: 'arrivals' });
      if (search.trim()) params.set('q', search.trim());
      return api<ReservationListItem[]>(`/reservations?${params}`);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });

  const overviewQuery = useQuery({
    queryKey: ['reservations', 'overview'],
    queryFn: () => api<ReservationOverview>('/reservations/overview'),
    refetchInterval: 60_000,
  });

  const syncMut = useMutation({
    mutationFn: () =>
      api<{ upserted: number; syncedAt: string }>('/reservations/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arrivals'] });
      void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });

  const rows = listQuery.data ?? [];
  const overview = overviewQuery.data;

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => compareRows(a, b, sortKey) * (sortDir === 'asc' ? 1 : -1));
    return copy;
  }, [rows, sortKey, sortDir]);

  function onSort(column: SortKey) {
    if (sortKey === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column);
      setSortDir('asc');
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Anreisen</h1>
          {overview?.lastSyncedAt && (
            <p className="mt-1 text-sm text-ink-muted">
              Zuletzt synchronisiert {new Date(overview.lastSyncedAt).toLocaleTimeString('de-CH')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-50"
        >
          {syncMut.isPending ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
        </button>
      </header>

      {overview && (
        <div className="flex flex-wrap items-end gap-3">
          <Kpi label="Anreisen" value={overview.arrivals || overview.checkInPending} />
          <Kpi label="In Liste" value={overview.visibleArrivals ?? rows.length} />
          <details className="ml-auto text-sm text-ink-muted">
            <summary className="cursor-pointer select-none rounded-lg px-3 py-2 hover:bg-surface-muted">
              Weitere Kennzahlen
            </summary>
            <div className="mt-2 flex flex-wrap gap-3">
              <Kpi label="Pending" value={overview.checkInPending} />
              <Kpi label="Queue" value={overview.checkInQueue} />
              <Kpi label="Check-in" value={overview.checkInDone} />
              <Kpi label="Im Haus" value={overview.inHouse} />
            </div>
          </details>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="border-b border-border px-4 py-3">
          <input
            type="search"
            placeholder="Gast, Res.-Nr., Zimmer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-muted/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-ink/20 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ink/8"
          />
        </div>

        {listQuery.isLoading ? (
          <p className="px-6 py-10 text-sm text-ink-muted">Lädt…</p>
        ) : sortedRows.length === 0 ? (
          <p className="px-6 py-10 text-sm text-ink-muted">
            {overview && (overview.arrivals || overview.checkInPending) === 0
              ? 'EMMA meldet derzeit 0 Anreisen für heute.'
              : 'Keine Anreisen in der Liste. Bitte erneut synchronisieren.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/50">
                <tr>
                  <SortableTh
                    label="Gast"
                    column="guest"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableTh
                    label="Res."
                    column="reservationId"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableTh
                    label="Zimmer"
                    column="roomId"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableTh
                    label="An / Ab"
                    column="arrivalDate"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableTh
                    label="Typ"
                    column="roomType"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableTh
                    label="Pax"
                    column="numPax"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableTh
                    label="VIP"
                    column="vip"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableTh
                    label="Karte"
                    column="creditCard"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {sortedRows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-muted/40">
                    <td className="px-4 py-3.5 font-medium text-ink">{r.mainGuestName ?? '—'}</td>
                    <td className="px-4 py-3.5 tabular-nums text-ink-muted">{r.reservationId}</td>
                    <td className="px-4 py-3.5 tabular-nums text-ink">{r.roomId ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-ink-muted">
                      <span className="tabular-nums">{r.arrivalDate}</span>
                      <span className="mx-1.5 text-ink-muted/50">→</span>
                      <span className="tabular-nums">{r.departureDate}</span>
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-3.5 text-ink-muted" title={r.roomType ?? undefined}>
                      {r.roomType ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-ink">{r.numPax ?? '—'}</td>
                    <td className="px-4 py-3.5 text-ink-muted">{r.vipDesc ?? r.tier ?? '—'}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-ink-muted">{r.creditCard ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/r/reservations/${r.reservationId}?from=arrivals`)
                        }
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                      >
                        Ansehen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!listQuery.isLoading && sortedRows.length > 0 && (
          <div className="border-t border-border px-4 py-2.5 text-xs text-ink-muted">
            {sortedRows.length} Einträge · Sortiert nach{' '}
            {sortKey === 'guest'
              ? 'Gast'
              : sortKey === 'reservationId'
                ? 'Res.'
                : sortKey === 'roomId'
                  ? 'Zimmer'
                  : sortKey === 'arrivalDate'
                    ? 'An / Ab'
                    : sortKey === 'roomType'
                      ? 'Typ'
                      : sortKey === 'numPax'
                        ? 'Pax'
                        : sortKey === 'vip'
                          ? 'VIP'
                          : 'Karte'}{' '}
            ({sortDir === 'asc' ? 'aufsteigend' : 'absteigend'})
          </div>
        )}
      </div>

      {syncMut.isError && (
        <p className="rounded-lg border border-danger/15 bg-danger-muted px-3 py-2 text-sm text-danger">
          {(syncMut.error as Error).message}
        </p>
      )}
    </div>
  );
}
