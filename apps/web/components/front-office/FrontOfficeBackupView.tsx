'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { FrontOfficeBackupOverview } from '@housekeeping/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { formatAge, formatTimestamp } from '@/lib/format-age';
import clsx from 'clsx';
import { FrontOfficeBackupPrint } from './FrontOfficeBackupPrint';

type Tab = 'rooms' | 'checkedIn' | 'pending' | 'shared';

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[7rem] rounded-lg border border-border/80 bg-surface px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-ink">{value}</p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={clsx(
        'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={clsx('px-3 py-2 text-sm text-ink', className)}>{children}</td>;
}

export function FrontOfficeBackupView({ data }: { data: FrontOfficeBackupOverview }) {
  const t = useTranslations('frontOfficeBackup');
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>('rooms');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
      <div className="rounded-lg border-4 border-rose-800 bg-rose-600 px-5 py-4 text-white shadow-lift print:hidden">
        <p className="text-lg font-black uppercase tracking-wider">{t('bannerTitle')}</p>
        <p className="mt-1 text-sm text-rose-100">{t('bannerSubtitle')}</p>
      </div>

      <div className="rounded-lg border border-border/80 bg-surface px-4 py-3 text-sm text-ink-muted print:hidden">
        <p className="font-medium text-ink">{t('freshnessTitle')}</p>
        <ul className="mt-2 space-y-1">
          <li>
            {t('freshnessReservations')}:{' '}
            <span className="font-medium text-ink">
              {formatAge(data.freshness.reservationsLastSyncedAt, locale)}
            </span>
            {data.freshness.reservationsLastSyncStatus === 'error' ? (
              <span className="ml-2 font-semibold text-rose-600">{t('syncFailed')}</span>
            ) : null}
          </li>
          <li>
            {t('freshnessRoomsOldest')}:{' '}
            <span className="font-medium text-ink">
              {formatAge(data.freshness.roomsOldestEmmaSyncedAt, locale)}
            </span>
          </li>
          <li>
            {t('freshnessGenerated')}:{' '}
            <span className="font-medium text-ink">{formatTimestamp(data.freshness.generatedAt, locale)}</span>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <Kpi label={t('kpi.clean')} value={cleanCount} />
        <Kpi label={t('kpi.checkedIn')} value={data.checkedIn.length} />
        <Kpi label={t('kpi.pending')} value={data.pendingCheckIn.length} />
        <Kpi label={t('kpi.sharedRooms')} value={data.sharedRooms.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={clsx(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              tab === item.id
                ? 'bg-ink text-white'
                : 'border border-border bg-surface text-ink-muted hover:text-ink',
            )}
          >
            {item.label} ({item.count})
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          {t('print')}
        </button>
      </div>

      {tab === 'rooms' ? (
        <div className="overflow-x-auto rounded-lg border border-border/80 bg-surface print:hidden">
          <div className="flex flex-wrap gap-2 border-b border-border/60 px-3 py-2">
            {['all', 'CLEAN', 'INSPECTED', 'DIRTY', 'IN_PROGRESS', 'OUT_OF_ORDER'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  'rounded px-2 py-0.5 text-xs font-medium',
                  statusFilter === s ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink',
                )}
              >
                {s === 'all' ? t('filterAll') : s}
              </button>
            ))}
          </div>
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-surface-muted/60">
              <tr>
                <Th>{t('col.room')}</Th>
                <Th>{t('col.floor')}</Th>
                <Th>{t('col.status')}</Th>
                <Th>{t('col.emmaCode')}</Th>
                <Th>{t('col.dataAge')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredRooms.map((room) => (
                <tr key={room.roomId}>
                  <Td className="font-semibold tabular-nums">{room.roomNumber}</Td>
                  <Td>{room.floor ?? '—'}</Td>
                  <Td>
                    <StatusBadge status={room.derivedStatus} />
                  </Td>
                  <Td className="text-ink-muted">{room.emmaStatusCode ?? '—'}</Td>
                  <Td className="text-ink-muted">{formatAge(room.emmaSyncedAt, locale)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <p className="text-xs text-ink-muted print:hidden">{t('balanceHint')}</p>
      ) : null}

      {tab === 'pending' ? (
        <ReservationTable
          rows={data.pendingCheckIn}
          showBalance
          locale={locale}
          t={t}
          className="print:hidden"
        />
      ) : null}

      {tab === 'shared' ? (
        <div className="space-y-4 print:hidden">
          {data.sharedRooms.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noSharedRooms')}</p>
          ) : (
            data.sharedRooms.map((group) => (
              <div key={group.roomNumber} className="rounded-lg border border-border/80 bg-surface">
                <div className="border-b border-border/60 px-4 py-2">
                  <p className="font-semibold text-ink">
                    {t('room')} {group.roomNumber}
                  </p>
                  <p className="text-xs text-ink-muted">{t('sharedCount', { count: group.reservations.length })}</p>
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
  return (
    <div
      className={clsx(
        !embedded && 'overflow-x-auto rounded-lg border border-border/80 bg-surface',
        className,
      )}
    >
      <table className="min-w-full divide-y divide-border/60">
        <thead className="bg-surface-muted/60">
          <tr>
            <Th>{t('col.guest')}</Th>
            <Th>{t('col.room')}</Th>
            <Th>{t('col.arrival')}</Th>
            <Th>{t('col.departure')}</Th>
            {showBalance ? <Th>{t('col.balance')}</Th> : null}
            <Th>{t('col.dataAge')}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((row) => (
            <tr key={row.id}>
              <Td className="font-medium">{row.mainGuestName ?? '—'}</Td>
              <Td className="tabular-nums">{row.roomNumber ?? '—'}</Td>
              <Td>{row.arrivalDate}</Td>
              <Td>{row.departureDate}</Td>
              {showBalance ? (
                <Td className="font-semibold tabular-nums text-rose-700">{row.balance ?? '—'}</Td>
              ) : null}
              <Td className="text-ink-muted">
                {formatAge(showBalance ? row.balanceFetchedAt : row.syncedAt, locale)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
