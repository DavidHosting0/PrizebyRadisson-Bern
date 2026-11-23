'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type {
  BreakfastDayEntryDto,
  BreakfastSpecialWishDto,
  BreakfastTodayDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { BreakfastNumpad } from './BreakfastNumpad';

function formatPeak(hour: number | null, persons: number, emptyLabel: string): string {
  if (hour == null) return emptyLabel;
  return `${String(hour).padStart(2, '0')}:00 · ${persons}`;
}

export function BreakfastBoard() {
  const t = useTranslations('kitchen');
  const tCommon = useTranslations('common');
  const canWrite = usePermission('BREAKFAST_WRITE');
  const canReadWishes = usePermission('BREAKFAST_WISHES_READ');
  const qc = useQueryClient();
  const [roomInput, setRoomInput] = useState('');
  const [wishesOpen, setWishesOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const todayQ = useQuery({
    queryKey: ['breakfast', 'today'],
    queryFn: () => api<BreakfastTodayDto>('/breakfast/today'),
    refetchInterval: 20_000,
  });

  const wishesQ = useQuery({
    queryKey: ['breakfast', 'wishes', todayQ.data?.serviceDate, 'OPEN'],
    queryFn: () =>
      api<BreakfastSpecialWishDto[]>(
        `/breakfast/wishes?date=${todayQ.data!.serviceDate}&status=OPEN`,
      ),
    enabled: wishesOpen && canReadWishes && Boolean(todayQ.data?.serviceDate),
  });

  const upsertMut = useMutation({
    mutationFn: (payload: { roomNumber: string; persons: number }) =>
      api<BreakfastDayEntryDto>('/breakfast/entries', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setErr(null);
      setRoomInput('');
      qc.invalidateQueries({ queryKey: ['breakfast'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const serveMut = useMutation({
    mutationFn: ({ id, served }: { id: string; served: boolean }) =>
      api(`/breakfast/entries/${id}/serve`, {
        method: 'PATCH',
        body: JSON.stringify({ served }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['breakfast', 'today'] }),
    onError: (e: Error) => setErr(e.message),
  });

  const entries = todayQ.data?.entries ?? [];
  const stats = todayQ.data?.stats;

  const match = useMemo(() => {
    if (!roomInput) return null;
    return entries.find((e) => e.room.roomNumber === roomInput) ?? null;
  }, [entries, roomInput]);

  function book(persons: number) {
    if (!roomInput || !canWrite) return;
    upsertMut.mutate({ roomNumber: roomInput, persons });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard label={t('statTotal')} value={stats?.totalPersons ?? '—'} />
        <StatCard label={t('statRemaining')} value={stats?.remainingPersons ?? '—'} />
        <StatCard
          label={t('statPeak')}
          value={formatPeak(stats?.peakHour ?? null, stats?.peakPersons ?? 0, t('statPeakEmpty'))}
        />
        <button
          type="button"
          onClick={() => canReadWishes && setWishesOpen(true)}
          className={clsx(
            'rounded-2xl bg-white/5 px-3 py-3 text-left ring-1 ring-inset ring-white/10 transition',
            canReadWishes && 'hover:bg-white/10 active:scale-[0.99]',
          )}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">
            {t('statWishes')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">{stats?.openWishesCount ?? '—'}</p>
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-base font-semibold text-white">{t('roomList')}</h2>
            <span className="text-xs text-sidebar-muted">
              {t('roomsCount', { count: entries.length })}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {todayQ.isLoading ? (
              <p className="p-4 text-sm text-sidebar-muted">{tCommon('loading')}</p>
            ) : entries.length === 0 ? (
              <p className="p-4 text-sm text-sidebar-muted">{t('emptyList')}</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3.5',
                      entry.servedAt && 'opacity-55',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-white">
                          {entry.room.roomNumber}
                        </span>
                        {entry.hasOpenWish && (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                            {t('wishBadge')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-sidebar-muted">
                        {t('persons', { count: entry.persons })}
                      </p>
                    </div>
                    {canWrite && (
                      <button
                        type="button"
                        disabled={serveMut.isPending}
                        onClick={() =>
                          serveMut.mutate({ id: entry.id, served: !entry.servedAt })
                        }
                        className={clsx(
                          'min-h-11 min-w-[5.5rem] rounded-xl px-3 text-sm font-semibold transition',
                          entry.servedAt
                            ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-inset ring-emerald-400/30'
                            : 'bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15',
                        )}
                      >
                        {entry.servedAt ? t('undoServe') : t('serve')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/10">
          <h2 className="text-base font-semibold text-white">{t('lookupTitle')}</h2>
          <div className="rounded-2xl bg-black/20 px-4 py-3 text-center ring-1 ring-inset ring-white/10">
            <p className="text-xs font-medium uppercase tracking-wide text-sidebar-muted">
              {t('roomNumber')}
            </p>
            <p className="mt-1 min-h-[2.5rem] text-4xl font-semibold tracking-[0.2em] text-white">
              {roomInput || '—'}
            </p>
          </div>
          <BreakfastNumpad value={roomInput} onChange={setRoomInput} />

          {roomInput ? (
            <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-inset ring-white/10">
              {match ? (
                <p className="text-sm text-white">
                  {t('foundBreakfast', {
                    room: match.room.roomNumber,
                    count: match.persons,
                  })}
                </p>
              ) : (
                <p className="text-sm text-sidebar-muted">{t('notFound')}</p>
              )}
              {canWrite && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={upsertMut.isPending}
                    onClick={() => book(1)}
                    className="min-h-12 rounded-xl bg-sky-500/20 text-sm font-semibold text-sky-100 ring-1 ring-inset ring-sky-400/30 hover:bg-sky-500/30"
                  >
                    {t('bookOne')}
                  </button>
                  <button
                    type="button"
                    disabled={upsertMut.isPending}
                    onClick={() => book(2)}
                    className="min-h-12 rounded-xl bg-sky-500/20 text-sm font-semibold text-sky-100 ring-1 ring-inset ring-sky-400/30 hover:bg-sky-500/30"
                  >
                    {t('bookTwo')}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {err && <p className="text-sm text-red-300">{err}</p>}
        </section>
      </div>

      {wishesOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#1a2433] shadow-lift ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-base font-semibold text-white">{t('wishesTitle')}</h3>
              <button
                type="button"
                onClick={() => setWishesOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-sidebar-muted hover:bg-white/10 hover:text-white"
              >
                {tCommon('close')}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {wishesQ.isLoading ? (
                <p className="text-sm text-sidebar-muted">{tCommon('loading')}</p>
              ) : (wishesQ.data ?? []).length === 0 ? (
                <p className="text-sm text-sidebar-muted">{t('wishesEmpty')}</p>
              ) : (
                <ul className="space-y-3">
                  {(wishesQ.data ?? []).map((w) => (
                    <li
                      key={w.id}
                      className="rounded-xl bg-white/5 px-3 py-3 ring-1 ring-inset ring-white/10"
                    >
                      <p className="text-base font-semibold text-white">{w.room.roomNumber}</p>
                      <p className="mt-1 text-sm text-amber-100/90">{w.tags.join(' · ')}</p>
                      {w.note && <p className="mt-1 text-sm text-sidebar-muted">{w.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-3 ring-1 ring-inset ring-white/10">
      <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
