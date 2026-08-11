'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { FrontOfficeBackupOverview } from '@housekeeping/shared';
import { StatusBadge, roomStatusLabel } from '@/components/StatusBadge';
import { APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { formatAge, formatTimestamp } from '@/lib/format-age';
import clsx from 'clsx';
import { FrontOfficeBackupPrint } from './FrontOfficeBackupPrint';

type Tab = 'rooms' | 'checkedIn' | 'pending' | 'shared';

const ROOM_STATUS_FILTERS = [
  'all',
  'CLEAN',
  'INSPECTED',
  'DIRTY',
  'IN_PROGRESS',
  'OUT_OF_ORDER',
] as const;

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${APP_DARK_CARD} min-w-[7rem] px-4 py-3`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-white">{value}</p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={clsx(
        'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-sidebar-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={clsx('px-4 py-3.5 text-sm', className)}>{children}</td>;
}

export function FrontOfficeBackupView({ data }: { data: FrontOfficeBackupOverview }) {
  const t = useTranslations('frontOfficeBackup');
  const tRoot = useTranslations();
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>('rooms');
  const [statusFilter, setStatusFilter] = useState<(typeof ROOM_STATUS_FILTERS)[number]>('all');

  const cleanCount = useMemo(
    () => data.rooms.filter((r) => r.derivedStatus === 'CLEAN' || r.derivedStatus === 'INSPECTED').length,
    [data.rooms],
  );

  const filteredRooms = useMemo(() => {
    if (statusFilter === 'all') return data.rooms;
    return data.rooms.filter((r) => r.derivedStatus === statusFilter);
  }, [data.rooms, statusFilter]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'rooms', label: t('tabs.rooms'), count: data.rooms.length },
    { id: 'checkedIn', label: t('tabs.checkedIn'), count: data.checkedIn.length },
    { id: 'pending', label: t('tabs.pending'), count: data.pendingCheckIn.length },
    { id: 'shared', label: t('tabs.shared'), count: data.sharedRooms.length },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-rose-400/40 bg-rose-500/10 px-5 py-4 print:hidden">
        <p className="text-sm font-semibold uppercase tracking-wider text-rose-200">{t('bannerTitle')}</p>
        <p className="mt-1 text-sm text-rose-100/80">{t('bannerSubtitle')}</p>
      </div>

      <div className={`${APP_DARK_CARD} px-4 py-3 text-sm print:hidden`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
          {t('freshnessTitle')}
        </p>
        <ul className="mt-2 space-y-1.5 text-sidebar-muted">
          <li>
            {t('freshnessReservations')}:{' '}
            <span className="font-medium text-white">
              {formatAge(data.freshness.reservationsLastSyncedAt, locale)}
            </span>
            {data.freshness.reservationsLastSyncStatus === 'error' ? (
              <span className="ml-2 rounded-full border border-rose-400/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">
                {t('syncFailed')}
              </span>
            ) : null}
          </li>
          <li>
            {t('freshnessRoomsStatusSync')}:{' '}
            <span className="font-medium text-white">
              {formatAge(
                data.freshness.roomsLastStatusSyncedAt ?? data.freshness.roomsNewestEmmaSyncedAt,
                locale,
              )}
            </span>
          </li>
          <li>
            {t('freshnessRoomsOldest')}:{' '}
            <span className="font-medium text-white">
              {formatAge(data.freshness.roomsOldestEmmaSyncedAt, locale)}
            </span>
          </li>
          <li>
            {t('freshnessGenerated')}:{' '}
            <span className="font-medium text-white">
              {formatTimestamp(data.freshness.generatedAt, locale)}
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <Kpi label={t('kpi.clean')} value={cleanCount} />
        <Kpi label={t('kpi.checkedIn')} value={data.checkedIn.length} />
        <Kpi label={t('kpi.pending')} value={data.pendingCheckIn.length} />
        <Kpi label={t('kpi.sharedRooms')} value={data.sharedRooms.length} />
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1 rounded-btn border border-sidebar-border/70 bg-sidebar p-1 sm:flex-nowrap">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={clsx(
                'min-h-[40px] flex-1 rounded-btn px-3 text-sm font-medium transition-colors sm:px-4',
                tab === item.id
                  ? 'bg-action text-white'
                  : 'text-sidebar-muted hover:text-white',
              )}
            >
              {item.label}
              <span
                className={clsx(
                  'ml-1.5 tabular-nums',
                  tab === item.id ? 'text-white/80' : 'text-sidebar-muted/70',
                )}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-btn border border-sidebar-border bg-transparent px-4 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          {t('print')}
        </button>
      </div>

      {tab === 'rooms' ? (
        <div className={`${APP_DARK_CARD} overflow-hidden print:hidden`}>
          <div className="flex flex-wrap gap-1.5 border-b border-sidebar-border/60 px-3 py-2.5">
            {ROOM_STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  statusFilter === s
                    ? 'bg-sidebar-hover text-white'
                    : 'text-sidebar-muted hover:bg-white/5 hover:text-white',
                )}
              >
                {s === 'all'
                  ? t('filterAll')
                  : roomStatusLabel(s, (key) => tRoot(key as 'room.status.DIRTY'))}
              </button>
            ))}
          </div>
          {filteredRooms.length === 0 ? (
            <p className="px-6 py-10 text-sm text-sidebar-muted">0</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-sidebar-border/60 bg-sidebar-hover/40">
                  <tr>
                    <Th>{t('col.room')}</Th>
                    <Th>{t('col.floor')}</Th>
                    <Th>{t('col.status')}</Th>
                    <Th>{t('col.emmaCode')}</Th>
                    <Th>{t('col.dataAge')}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sidebar-border/40">
                  {filteredRooms.map((room) => (
                    <tr key={room.roomId} className="transition-colors hover:bg-white/5">
                      <Td className="font-semibold tabular-nums text-white">{room.roomNumber}</Td>
                      <Td className="text-sidebar-muted">{room.floor ?? '—'}</Td>
                      <Td>
                        <StatusBadge status={room.derivedStatus} variant="dark" />
                      </Td>
                      <Td className="text-sidebar-muted">{room.emmaStatusCode ?? '—'}</Td>
                      <Td className="text-sidebar-muted">{formatAge(room.emmaSyncedAt, locale)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-sidebar-border/60 px-4 py-2.5 text-xs text-sidebar-muted">
            {filteredRooms.length} / {data.rooms.length}
          </div>
        </div>
      ) : null}

      {tab === 'checkedIn' ? (
        <ReservationTable
          rows={data.checkedIn}
          showBalance={false}
          locale={locale}
          t={t}
          className="print:hidden"
        />
      ) : null}

      {tab === 'pending' ? (
        <div className="space-y-3 print:hidden">
          <p className="rounded-card border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {t('balanceHint')}
          </p>
          <ReservationTable rows={data.pendingCheckIn} showBalance locale={locale} t={t} />
        </div>
      ) : null}

      {tab === 'shared' ? (
        <div className="space-y-4 print:hidden">
          {data.sharedRooms.length === 0 ? (
            <p className={`${APP_DARK_CARD} px-6 py-10 text-sm text-sidebar-muted`}>
              {t('noSharedRooms')}
            </p>
          ) : (
            data.sharedRooms.map((group) => (
              <div key={group.roomNumber} className={`${APP_DARK_CARD} overflow-hidden`}>
                <div className="border-b border-sidebar-border/60 bg-white/5 px-4 py-3">
                  <p className="font-semibold text-white">
                    {t('room')} {group.roomNumber}
                  </p>
                  <p className="text-xs text-sidebar-muted">
                    {t('sharedCount', { count: group.reservations.length })}
                  </p>
                </div>
                <ReservationTable rows={group.reservations} showBalance locale={locale} t={t} embedded />
              </div>
            ))
          )}
        </div>
      ) : null}

      <FrontOfficeBackupPrint data={data} locale={locale} />
    </div>
  );
}

function ReservationTable({
  rows,
  showBalance,
  locale,
  t,
  className,
  embedded,
}: {
  rows: FrontOfficeBackupOverview['checkedIn'];
  showBalance: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations<'frontOfficeBackup'>>;
  className?: string;
  embedded?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p
        className={clsx(
          !embedded && `${APP_DARK_CARD} px-6 py-10`,
          'text-sm text-sidebar-muted',
          className,
        )}
      >
        —
      </p>
    );
  }

  return (
    <div
      className={clsx(
        !embedded && `${APP_DARK_CARD} overflow-hidden`,
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-sidebar-border/60 bg-sidebar-hover/40">
            <tr>
              <Th>{t('col.guest')}</Th>
              <Th>{t('col.room')}</Th>
              <Th>
                {t('col.arrival')} / {t('col.departure')}
              </Th>
              {showBalance ? <Th>{t('col.balance')}</Th> : null}
              <Th>{t('col.dataAge')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sidebar-border/40">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-white/5">
                <Td className="font-medium text-white">{row.mainGuestName ?? '—'}</Td>
                <Td className="tabular-nums text-white">{row.roomNumber ?? '—'}</Td>
                <Td className="whitespace-nowrap text-sidebar-muted">
                  <span className="tabular-nums">{row.arrivalDate}</span>
                  <span className="mx-1.5 text-sidebar-muted/50">→</span>
                  <span className="tabular-nums">{row.departureDate}</span>
                </Td>
                {showBalance ? (
                  <Td
                    className={clsx(
                      'font-semibold tabular-nums',
                      row.balance ? 'text-rose-300' : 'text-sidebar-muted',
                    )}
                  >
                    {row.balance ?? '—'}
                  </Td>
                ) : null}
                <Td className="text-sidebar-muted">
                  {formatAge(showBalance ? row.balanceFetchedAt : row.syncedAt, locale)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!embedded ? (
        <div className="border-t border-sidebar-border/60 px-4 py-2.5 text-xs text-sidebar-muted">
          {rows.length}
        </div>
      ) : null}
    </div>
  );
}
