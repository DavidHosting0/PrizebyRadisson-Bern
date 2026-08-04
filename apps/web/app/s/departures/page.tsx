'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { DailyDeparturesResponse } from '@housekeeping/shared';
import { formatFloorLabel, hotelTodayIso } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { KpiStat } from '@/components/supervisor/KpiStat';
import { AutoAssignSetupModal } from '@/components/supervisor/AutoAssignModal';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';

function formatSyncedAt(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
}

function isStale(syncedAt: string | null): boolean {
  if (!syncedAt) return true;
  const ageMs = Date.now() - new Date(syncedAt).getTime();
  return ageMs > 15 * 60 * 1000;
}

export default function SupervisorDeparturesPage() {
  const qc = useQueryClient();
  const today = hotelTodayIso();
  const [date, setDate] = useState(today);
  const [autoOpen, setAutoOpen] = useState(false);
  const canSync = usePermission('RESERVATIONS_SYNC');

  const departuresQ = useQuery({
    queryKey: ['departures', date],
    queryFn: () => api<DailyDeparturesResponse>(`/departures?date=${encodeURIComponent(date)}`),
    refetchInterval: 60_000,
  });

  const refreshMut = useMutation({
    mutationFn: () => api<DailyDeparturesResponse>('/departures/refresh', { method: 'POST' }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['departures'] });
      void qc.invalidateQueries({ queryKey: ['assignments'] });
      void qc.invalidateQueries({ queryKey: ['rooms'] });
      if (data.date) setDate(data.date);
    },
  });

  const data = departuresQ.data;
  const items = data?.items ?? [];

  const stats = useMemo(() => {
    const assigned = items.filter((i) => i.assignedHousekeeper).length;
    return {
      total: items.length,
      assigned,
      unassigned: items.length - assigned,
      unmapped: data?.unmappedRooms.length ?? 0,
    };
  }, [items, data?.unmappedRooms.length]);

  const grouped = useMemo(() => {
    const map = new Map<number | 'other', typeof items>();
    for (const item of items) {
      const key = item.floor ?? 'other';
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      return (a as number) - (b as number);
    });
  }, [items]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Daily departures</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Rooms with guests departing on the selected day — use auto-assign to distribute work evenly by floor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSync && (
            <Button
              variant="secondary"
              className="min-h-[44px]"
              disabled={refreshMut.isPending}
              onClick={() => refreshMut.mutate()}
            >
              {refreshMut.isPending ? 'Refreshing…' : 'Refresh from EMMA'}
            </Button>
          )}
          <Button variant="action" className="min-h-[44px]" onClick={() => setAutoOpen(true)}>
            Auto room assignment
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Date</span>
          <DateInput value={date} onChange={(e) => setDate(e.target.value)} className="min-w-[11rem]" />
        </label>
        {data && (
          <p className="text-sm text-ink-muted">
            Last synced: {formatSyncedAt(data.syncedAt)}
            {isStale(data.syncedAt) && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                Stale
              </span>
            )}
          </p>
        )}
      </div>

      {data?.warnings.map((w) => (
        <div
          key={w}
          className="rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {w}
        </div>
      ))}

      {departuresQ.isLoading && <p className="text-sm text-ink-muted">Loading departures…</p>}
      {departuresQ.isError && <p className="text-sm text-danger">Could not load departures.</p>}

      {data && (
        <>
          <section>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiStat label="Departures" value={stats.total} />
              <KpiStat label="Assigned" value={stats.assigned} />
              <KpiStat label="Unassigned" value={stats.unassigned} />
              <KpiStat
                label="EMMA expected"
                value={data.emmaExpectedCount ?? '—'}
                sub={date === today ? 'Today only' : 'N/A for other dates'}
              />
              <KpiStat label="Unmapped rooms" value={stats.unmapped} sub="No local room match" />
            </div>
          </section>

          {data.unmappedRooms.length > 0 && (
            <section className="rounded-card border border-border bg-surface-muted/40 p-4">
              <h2 className="text-sm font-semibold text-ink">Unmapped EMMA rooms</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {data.unmappedRooms.map((u) => (
                  <li key={`${u.reservationId}-${u.emmaRoomId}`}>
                    Reservation {u.reservationId} · EMMA room {u.emmaRoomId}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-6">
            {grouped.map(([floorKey, floorItems]) => (
              <div key={String(floorKey)} className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
                <div className="border-b border-border bg-surface-muted/50 px-4 py-3">
                  <h2 className="text-sm font-semibold text-ink">
                    {floorKey === 'other' ? 'Other' : formatFloorLabel(floorKey as number)}
                  </h2>
                  <p className="text-xs text-ink-muted">{floorItems.length} departures</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-ink-muted">
                        <th className="px-4 py-3 font-semibold">Room</th>
                        <th className="px-4 py-3 font-semibold">Guest</th>
                        <th className="px-4 py-3 font-semibold">Checkout</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Assigned to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {floorItems.map((item) => (
                        <tr key={item.reservationId} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3 font-medium text-ink">{item.roomNumber}</td>
                          <td className="px-4 py-3 text-ink-muted">{item.mainGuestName ?? '—'}</td>
                          <td className="px-4 py-3 tabular-nums text-ink-muted">
                            {item.expectedDepartureTime ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            {item.checkOut ? (
                              <span className="text-xs font-medium text-ink-muted">Checked out</span>
                            ) : (
                              <span className="text-xs font-medium text-ink">In room</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink-muted">
                            {item.assignedHousekeeper
                              ? formatUserWithTitlePrefix(
                                  item.assignedHousekeeper.name,
                                  item.assignedHousekeeper.titlePrefix,
                                )
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-ink-muted">No departures for this date.</p>
            )}
          </section>
        </>
      )}

      <p className="text-sm text-ink-muted">
        <Link href="/s/board" className="font-medium text-action hover:underline">
          Open assignment board
        </Link>{' '}
        to adjust assignments manually.
      </p>

      <AutoAssignSetupModal open={autoOpen} onClose={() => setAutoOpen(false)} date={date} />
    </div>
  );
}
