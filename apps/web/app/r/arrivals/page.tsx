'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ReservationListItem, ReservationOverview } from '@housekeeping/shared';
import { api } from '@/lib/api';
import {
  ArrivalsTable,
  useArrivalsSortLabel,
  compareArrivalRows,
  type ArrivalsSortDir,
  type ArrivalsSortKey,
} from '@/components/reception/ArrivalsTable';
import {
  AppPageChrome,
  AppPageBody,
  APP_DARK_CARD,
  APP_DARK_INPUT,
} from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${APP_DARK_CARD} min-w-[7rem] px-4 py-3`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-white">{value}</p>
    </div>
  );
}

export default function ReceptionArrivalsPage() {
  const router = useRouter();
  const sortLabel = useArrivalsSortLabel();
  const queryClient = useQueryClient();
  const { enterMobile } = useReceptionMobileMode();
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
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Anreisen"
        description={
          overview?.lastSyncedAt
            ? `Zuletzt synchronisiert ${new Date(overview.lastSyncedAt).toLocaleTimeString('de-CH')}`
            : undefined
        }
        actions={
          <>
            <AppChromeTools onEnterMobile={enterMobile} />
            <button
              type="button"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
              className="inline-flex min-h-[40px] items-center justify-center rounded-btn bg-action px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-action/90 disabled:opacity-50"
            >
              {syncMut.isPending ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
            </button>
          </>
        }
      />

      <AppPageBody>
        <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">

      {overview && (
        <div className="flex flex-wrap items-end gap-3">
          <Kpi label="Anreisen" value={overview.arrivals || overview.checkInPending} />
          <Kpi label="In Liste" value={overview.visibleArrivals ?? rows.length} />
          <details className="ml-auto text-sm text-sidebar-muted">
            <summary className="cursor-pointer select-none rounded-lg px-3 py-2 hover:bg-white/5">
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

      <div className={`${APP_DARK_CARD} overflow-hidden`}>
        <div className="border-b border-sidebar-border/60 px-4 py-3">
          <input
            type="search"
            placeholder="Gast, Res.-Nr., Zimmer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${APP_DARK_INPUT} w-full py-2.5`}
          />
        </div>

        {listQuery.isLoading ? (
          <p className="px-6 py-10 text-sm text-sidebar-muted">Lädt…</p>
        ) : sortedRows.length === 0 ? (
          <p className="px-6 py-10 text-sm text-sidebar-muted">
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
          <div className="border-t border-sidebar-border/60 px-4 py-2.5 text-xs text-sidebar-muted">
            {sortedRows.length} Einträge · Sortiert nach {sortLabel(sortKey)} (
            {sortDir === 'asc' ? 'aufsteigend' : 'absteigend'})
          </div>
        )}
      </div>

      {syncMut.isError && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {(syncMut.error as Error).message}
        </p>
      )}
        </div>
      </AppPageBody>
    </div>
  );
}
