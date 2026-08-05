'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ReservationListItem } from '@housekeeping/shared';
import { api } from '@/lib/api';
import {
  AppPageChrome,
  AppPageBody,
  APP_DARK_CARD,
  APP_DARK_INPUT,
} from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

function statusLabel(r: ReservationListItem) {
  if (r.checkOut) return { text: 'Ausgecheckt', className: 'text-sidebar-muted' };
  if (r.checkIn) return { text: 'Im Haus', className: 'text-emerald-300' };
  if (r.checkInQueue) return { text: 'Queue', className: 'text-amber-300' };
  return { text: 'Anreise', className: 'text-sky-300' };
}

export default function ReceptionReservationsPage() {
  const router = useRouter();
  const { enterMobile } = useReceptionMobileMode();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const listQuery = useQuery({
    queryKey: ['reservations', 'all', debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ tab: 'all' });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      return api<ReservationListItem[]>(`/reservations?${params}`);
    },
    staleTime: 30_000,
  });

  const rows = listQuery.data ?? [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
  };

  const subtitle = useMemo(() => {
    if (listQuery.isLoading) return 'Lädt gespeicherte Reservierungen…';
    if (debouncedSearch.trim()) {
      return `${rows.length} Treffer für „${debouncedSearch.trim()}“`;
    }
    return `${rows.length} gespeicherte Reservierungen (neueste zuerst, max. 500)`;
  }, [debouncedSearch, listQuery.isLoading, rows.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Reservierungen"
        description="Alle lokal gespeicherten EMMA-Reservierungen durchsuchen und Details ansehen"
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />

      <AppPageBody>
        <div className="space-y-6 p-4 md:p-6">

      <div className={`${APP_DARK_CARD} p-4`}>
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Gast, Res.-Nr., Zimmer, Gruppe, Typ…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${APP_DARK_INPUT} min-w-[220px] flex-1 py-2`}
          />
          <button
            type="submit"
            className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action/90"
          >
            Suchen
          </button>
          {debouncedSearch && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setDebouncedSearch('');
              }}
              className="rounded-lg border border-sidebar-border bg-transparent px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Zurücksetzen
            </button>
          )}
        </form>
        <p className="mt-2 text-xs text-sidebar-muted">{subtitle}</p>
      </div>

      <div className={`${APP_DARK_CARD} overflow-hidden`}>
        {listQuery.isLoading ? (
          <p className="p-6 text-sm text-sidebar-muted">Lädt…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-sidebar-muted">
            {debouncedSearch.trim()
              ? 'Keine Reservierungen für diese Suche gefunden.'
              : 'Noch keine gespeicherten Reservierungen. Synchronisation unter Anreisen oder Admin → EMMA auslösen.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-sidebar-border/60 bg-white/5 text-xs uppercase tracking-wide text-sidebar-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Gast</th>
                  <th className="px-4 py-3 font-semibold">Res.-Nr.</th>
                  <th className="px-4 py-3 font-semibold">Zimmer</th>
                  <th className="px-4 py-3 font-semibold">Anreise</th>
                  <th className="px-4 py-3 font-semibold">Abreise</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Gruppe</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/40">
                {rows.map((r) => {
                  const status = statusLabel(r);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-white">{r.mainGuestName ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums text-sidebar-muted">{r.reservationId}</td>
                      <td className="px-4 py-3 tabular-nums text-white">{r.roomId ?? '—'}</td>
                      <td className="px-4 py-3 text-sidebar-muted">{r.arrivalDate}</td>
                      <td className="px-4 py-3 text-sidebar-muted">{r.departureDate}</td>
                      <td className={`px-4 py-3 font-medium ${status.className}`}>{status.text}</td>
                      <td className="px-4 py-3 text-sidebar-muted">{r.groupName ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/r/reservations/${r.reservationId}?from=all`)
                          }
                          className="rounded-lg border border-sidebar-border bg-transparent px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          Ansehen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {listQuery.isError && (
        <p className="text-sm text-rose-300">{(listQuery.error as Error).message}</p>
      )}
        </div>
      </AppPageBody>
    </div>
  );
}
