'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { GuestStaySignals, ReservationListItem, ReservationOverview } from '@housekeeping/shared';
import { deriveGuestStaySignals, hotelTodayIso } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { GuestStayTypeIcons, GuestStayTypeLegend } from '@/components/reception/GuestStayTypeIcons';
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
    <div className={`${APP_DARK_CARD} px-3 py-2`}>
      <p className="text-xs text-sidebar-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function reservationStaySignals(r: ReservationListItem): GuestStaySignals {
  return deriveGuestStaySignals({
    arrivalDate: r.arrivalDate,
    departureDate: r.departureDate,
    today: hotelTodayIso(),
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    stayover: r.stayover,
    ocoDone: r.ocoDone,
    inHouse: true,
  });
}

export default function ReceptionInHousePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { enterMobile } = useReceptionMobileMode();
  const [search, setSearch] = useState('');

  const listQuery = useQuery({
    queryKey: ['in-house', search],
    queryFn: () => {
      const params = new URLSearchParams({ tab: 'inhouse' });
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
      void queryClient.invalidateQueries({ queryKey: ['in-house'] });
      void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });

  const rows = listQuery.data ?? [];
  const overview = overviewQuery.data;

  const stats = useMemo(() => {
    const signals = rows.map(reservationStaySignals);
    const departuresToday = signals.filter((s) => s.isDepartureToday).length;
    const stayovers = signals.filter((s) => s.isRestant).length;
    const arrivalsToday = signals.filter((s) => s.isArrivalToday).length;
    return { departuresToday, stayovers, arrivalsToday };
  }, [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Im Haus"
        description={
          overview?.lastSyncedAt
            ? `EMMA In-House-Liste — eingecheckte Gäste mit Zimmer · Sync ${new Date(overview.lastSyncedAt).toLocaleTimeString('de-CH')}`
            : 'EMMA In-House-Liste — eingecheckte Gäste mit Zimmer'
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
        <div className="space-y-6 p-4 md:p-6">

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi label="In Liste" value={rows.length} />
            <Kpi label="Im Haus (EMMA KPI)" value={overview.inHouse} />
            <Kpi label="Heute eingecheckt" value={stats.arrivalsToday} />
            <Kpi label="Abreise heute" value={stats.departuresToday} />
            <Kpi label="Restant" value={stats.stayovers} />
          </div>
          <GuestStayTypeLegend />
          <p className="text-xs text-sidebar-muted">
            Entspricht der EMMA Search-Reservations-Ansicht <strong>In House</strong> (Status-basiert,
            synchronisiert mit Check-In-Daten). Nach dem Sync sollte „In Liste“ der EMMA In-House-Liste
            entsprechen — bei Abweichung bitte „Jetzt synchronisieren“.
          </p>
        </>
      )}

      <div className={`${APP_DARK_CARD} p-4`}>
        <input
          type="search"
          placeholder="Gast, Res.-Nr., Zimmer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${APP_DARK_INPUT} w-full py-2`}
        />
      </div>

      <div className={`${APP_DARK_CARD} overflow-hidden`}>
        {listQuery.isLoading ? (
          <p className="p-6 text-sm text-sidebar-muted">Lädt…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-sidebar-muted">
            {overview && overview.inHouse === 0
              ? 'EMMA meldet derzeit 0 Gäste im Haus.'
              : 'Keine In-House-Gäste in der Liste. Bitte erneut synchronisieren (Admin → EMMA).'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-left text-sm">
              <thead className="border-b border-sidebar-border/60 bg-white/5 text-xs uppercase tracking-wide text-sidebar-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Zimmer</th>
                  <th className="px-4 py-3 font-semibold">Typ</th>
                  <th className="px-4 py-3 font-semibold">Gast</th>
                  <th className="px-4 py-3 font-semibold">Res.</th>
                  <th className="px-4 py-3 font-semibold">An / Ab</th>
                  <th className="px-4 py-3 font-semibold">Abreisezeit</th>
                  <th className="px-4 py-3 font-semibold">Zimmertyp</th>
                  <th className="px-4 py-3 font-semibold">Pax</th>
                  <th className="px-4 py-3 font-semibold">VIP</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/40">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-white/5">
                    <td className="px-4 py-3 font-semibold tabular-nums text-white">{r.roomId ?? '—'}</td>
                    <td className="px-4 py-3">
                      <GuestStayTypeIcons
                        stay={reservationStaySignals(r)}
                        size="md"
                        showLabels
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{r.mainGuestName ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-sidebar-muted">{r.reservationId}</td>
                    <td className="px-4 py-3 text-sidebar-muted">
                      {r.arrivalDate} → {r.departureDate}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-sidebar-muted">
                      {r.expectedDepartureTime ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sidebar-muted">{r.roomType ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-white">{r.numPax ?? '—'}</td>
                    <td className="px-4 py-3 text-sidebar-muted">{r.vipDesc ?? r.tier ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/r/reservations/${r.reservationId}?from=in-house`)
                        }
                        className="rounded-lg border border-sidebar-border bg-transparent px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
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
      </div>

      {syncMut.isError && (
        <p className="text-sm text-rose-300">{(syncMut.error as Error).message}</p>
      )}
        </div>
      </AppPageBody>
    </div>
  );
}
