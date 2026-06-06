'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReservationListItem, ReservationOverview } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { ReceptionReservationDetailPanel } from '@/components/reception/ReceptionReservationDetailPanel';

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/50 px-3 py-2">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

export default function ReceptionArrivalsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Anreisen</h1>
          <p className="mt-1 text-sm text-ink-muted">
            EMMA Check-In — Anreisen (wie EMMA Tab „Arrivals“)
            {overview?.lastSyncedAt && (
              <span className="ml-2">
                · Sync {new Date(overview.lastSyncedAt).toLocaleTimeString('de-CH')}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {syncMut.isPending ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
        </button>
      </header>

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Kpi label="Anreisen (EMMA)" value={overview.arrivals || overview.checkInPending} />
            <Kpi label="In Liste" value={overview.visibleArrivals ?? rows.length} />
          </div>
          <p className="text-xs text-ink-muted">
            Die Tabelle entspricht dem EMMA Check-In Tab <strong>Arrivals</strong> (heute,
            noch nicht eingecheckt, nicht in Queue).
          </p>
          <details className="text-xs text-ink-muted">
            <summary className="cursor-pointer font-medium text-ink-muted hover:text-ink">
              Weitere EMMA-Kennzahlen
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Pending" value={overview.checkInPending} />
              <Kpi label="Queue" value={overview.checkInQueue} />
              <Kpi label="Check-in done" value={overview.checkInDone} />
              <Kpi label="Im Haus" value={overview.inHouse} />
            </div>
          </details>
        </>
      )}

      <Card className="p-4">
        <input
          type="search"
          placeholder="Gast, Res.-Nr., Zimmer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
      </Card>

      <Card className="overflow-hidden">
        {listQuery.isLoading ? (
          <p className="p-6 text-sm text-ink-muted">Lädt…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted">
            {overview && (overview.arrivals || overview.checkInPending) === 0
              ? 'EMMA meldet derzeit 0 Anreisen für heute.'
              : 'Keine Anreisen in der Liste. Bitte erneut synchronisieren (Admin → EMMA).'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/40 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Gast</th>
                  <th className="px-4 py-3 font-semibold">Res.</th>
                  <th className="px-4 py-3 font-semibold">Zimmer</th>
                  <th className="px-4 py-3 font-semibold">An / Ab</th>
                  <th className="px-4 py-3 font-semibold">Typ</th>
                  <th className="px-4 py-3 font-semibold">Pax</th>
                  <th className="px-4 py-3 font-semibold">VIP</th>
                  <th className="px-4 py-3 font-semibold">Karte</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-border/60 hover:bg-surface-muted/30"
                    onClick={() => setSelectedId(r.reservationId)}
                  >
                    <td className="px-4 py-3 font-medium text-ink">{r.mainGuestName ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-muted">{r.reservationId}</td>
                    <td className="px-4 py-3 tabular-nums">{r.roomId ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {r.arrivalDate} → {r.departureDate}
                    </td>
                    <td className="px-4 py-3">{r.roomType ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{r.numPax ?? '—'}</td>
                    <td className="px-4 py-3">{r.vipDesc ?? r.tier ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.creditCard ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {syncMut.isError && (
        <p className="text-sm text-rose-700">{(syncMut.error as Error).message}</p>
      )}

      <ReceptionReservationDetailPanel
        reservationId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
