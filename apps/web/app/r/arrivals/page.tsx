'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ReservationListItem, ReservationOverview } from '@housekeeping/shared';
import { api } from '@/lib/api';
import {
  ArrivalsTable,
  arrivalsSortLabel,
  compareArrivalRows,
  type ArrivalsSortDir,
  type ArrivalsSortKey,
} from '@/components/reception/ArrivalsTable';

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
  const [sortKey, setSortKey] = useState<ArrivalsSortKey>('guest');
  const [sortDir, setSortDir] = useState<ArrivalsSortDir>('asc');

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
    copy.sort((a, b) => compareArrivalRows(a, b, sortKey) * (sortDir === 'asc' ? 1 : -1));
    return copy;
  }, [rows, sortKey, sortDir]);

  function onSort(column: ArrivalsSortKey) {
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
          <ArrivalsTable
            rows={sortedRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onView={(reservationId) =>
              router.push(`/r/reservations/${reservationId}?from=arrivals`)
            }
          />
        )}

        {!listQuery.isLoading && sortedRows.length > 0 && (
          <div className="border-t border-border px-4 py-2.5 text-xs text-ink-muted">
            {sortedRows.length} Einträge · Sortiert nach {arrivalsSortLabel(sortKey)} (
            {sortDir === 'asc' ? 'aufsteigend' : 'absteigend'})
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
