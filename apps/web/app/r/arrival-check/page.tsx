'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ArrivalCheckRunDetail, ReservationListItem } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import {
  ArrivalsTable,
  arrivalsSortLabel,
  compareArrivalRows,
  type ArrivalsSortDir,
  type ArrivalsSortKey,
} from '@/components/reception/ArrivalsTable';

export default function ArrivalCheckPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canStart = usePermission('RESERVATIONS_SYNC');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ArrivalsSortKey>('guest');
  const [sortDir, setSortDir] = useState<ArrivalsSortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [startError, setStartError] = useState<string | null>(null);

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

  const startMut = useMutation({
    mutationFn: (reservationIds: string[]) =>
      api<ArrivalCheckRunDetail>('/arrival-check/runs', {
        method: 'POST',
        body: JSON.stringify({ reservationIds }),
      }),
    onSuccess: (run) => {
      setStartError(null);
      router.push(`/r/arrival-check/runs/${run.id}`);
    },
    onError: (err) => {
      setStartError((err as Error).message);
    },
  });

  const rows = listQuery.data ?? [];

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => compareArrivalRows(a, b, sortKey) * (sortDir === 'asc' ? 1 : -1));
    return copy;
  }, [rows, sortKey, sortDir]);

  const visibleIds = useMemo(
    () => sortedRows.map((r) => r.reservationId),
    [sortedRows],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  function onSort(column: ArrivalsSortKey) {
    if (sortKey === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column);
      setSortDir('asc');
    }
  }

  function toggleSelection(reservationId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reservationId)) next.delete(reservationId);
      else next.add(reservationId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Arrival Check</h1>
        </div>
        <button
          type="button"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-muted disabled:opacity-50"
        >
          {syncMut.isPending ? 'Synchronisiere…' : 'Reservierungen synchronisieren'}
        </button>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <input
            type="search"
            placeholder="Gast, Res.-Nr., Zimmer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[12rem] flex-1 rounded-lg border border-border bg-surface-muted/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-ink/20 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ink/8"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleAllVisible}
              disabled={sortedRows.length === 0}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted disabled:opacity-50"
            >
              {allVisibleSelected ? 'Auswahl aufheben' : 'Alle auswählen'}
            </button>
            <span className="text-sm text-ink-muted">
              {selectedCount} von {sortedRows.length} ausgewählt
            </span>
            <button
              type="button"
              onClick={() => startMut.mutate([...selectedIds])}
              disabled={!canStart || selectedCount === 0 || startMut.isPending}
              title={!canStart ? 'Keine Berechtigung (RESERVATIONS_SYNC)' : undefined}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-50"
            >
              {startMut.isPending ? 'Startet…' : 'Anreise-Check starten'}
            </button>
          </div>
        </div>

        {listQuery.isLoading ? (
          <p className="px-6 py-10 text-sm text-ink-muted">Lädt…</p>
        ) : sortedRows.length === 0 ? (
          <p className="px-6 py-10 text-sm text-ink-muted">
            Keine Anreisen für heute. Bitte Reservierungen synchronisieren.
          </p>
        ) : (
          <ArrivalsTable
            rows={sortedRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            selection={{
              selectedIds,
              onToggle: toggleSelection,
              allVisibleSelected,
              someVisibleSelected,
            }}
          />
        )}

        {!listQuery.isLoading && sortedRows.length > 0 && (
          <div className="border-t border-border px-4 py-2.5 text-xs text-ink-muted">
            {sortedRows.length} Einträge · Sortiert nach {arrivalsSortLabel(sortKey)} (
            {sortDir === 'asc' ? 'aufsteigend' : 'absteigend'})
          </div>
        )}
      </div>

      {(syncMut.isError || startError) && (
        <p className="rounded-lg border border-danger/15 bg-danger-muted px-3 py-2 text-sm text-danger">
          {startError ?? (syncMut.error as Error).message}
        </p>
      )}
    </div>
  );
}
