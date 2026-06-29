'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { RoomManagementDetailDto } from '@housekeeping/shared';
import type { RoomOccupancy } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { useDamageTypeLabel } from '@/lib/damageReportTypes';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { RoomOccupancySection } from '@/components/rooms/RoomOccupancyDisplay';
import { RoomPhotoTimeline } from '@/components/room-management/RoomPhotoTimeline';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';
import { PageHeader, PageShell } from '@/components/ui/PageShell';
import { Button } from '@/components/ui/Button';

type TabId = 'overview' | 'guests' | 'cleaning' | 'photos' | 'damages' | 'lostFound';

type Props = {
  roomId: string;
  listPath: '/s/room-management' | '/r/room-management';
  reservationsPath?: string;
};

type RoomSummary = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  roomType?: { name: string };
  occupancy?: RoomOccupancy | null;
  lastCleaning?: { by: { name: string; titlePrefix: string }; at: string } | null;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

export function RoomManagementDetail({ roomId, listPath, reservationsPath = '/r/reservations' }: Props) {
  const t = useTranslations('roomManagement');
  const tCommon = useTranslations('common');
  const damageLabel = useDamageTypeLabel();
  const canViewReservations = usePermission('RESERVATIONS_READ');
  const [tab, setTab] = useState<TabId>('overview');
  const [guestFrom, setGuestFrom] = useState('');
  const [guestTo, setGuestTo] = useState('');

  const queryKey = ['room-management', roomId, guestFrom, guestTo] as const;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (guestFrom) params.set('from', guestFrom);
      if (guestTo) params.set('to', guestTo);
      const q = params.toString();
      return api<RoomManagementDetailDto>(
        `/room-management/rooms/${roomId}${q ? `?${q}` : ''}`,
      );
    },
  });

  const room = data?.room as RoomSummary | undefined;

  const cleaningTimeline = useMemo(() => {
    if (!data) return [];
    type Row = {
      id: string;
      at: string;
      label: string;
      user: string;
      kind: 'inspection' | 'housekeeping' | 'assignment';
    };
    const rows: Row[] = [];

    for (const insp of data.inspections) {
      rows.push({
        id: `insp-${insp.id}`,
        at: insp.inspectedAt,
        label: insp.passed ? t('passedInspection') : t('failedInspection'),
        user: formatUserWithTitlePrefix(insp.inspector.name, insp.inspector.titlePrefix),
        kind: 'inspection',
      });
    }
    for (const ev of data.housekeepingEvents) {
      rows.push({
        id: `hk-${ev.id}`,
        at: ev.occurredAt,
        label: ev.kind === 'MARKED_CLEAN' ? t('markedClean') : t('checklistReopened'),
        user: formatUserWithTitlePrefix(ev.user.name, ev.user.titlePrefix),
        kind: 'housekeeping',
      });
    }
    for (const a of data.assignments) {
      rows.push({
        id: `asg-${a.id}`,
        at: a.assignedAt,
        label: `${t('assignment')} (${a.status})`,
        user: formatUserWithTitlePrefix(a.housekeeper.name, a.housekeeper.titlePrefix),
        kind: 'assignment',
      });
    }

    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [data, t]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: t('tabOverview') },
    { id: 'guests', label: t('tabGuests') },
    { id: 'cleaning', label: t('tabCleaning') },
    { id: 'photos', label: t('tabPhotos') },
    { id: 'damages', label: t('tabDamages') },
    { id: 'lostFound', label: t('tabLostFound') },
  ];

  if (isLoading) {
    return (
      <PageShell>
        <p className="text-sm text-ink-muted">{tCommon('loading')}</p>
      </PageShell>
    );
  }

  if (isError || !data || !room) {
    return (
      <PageShell>
        <p className="text-sm text-ink-muted">{tCommon('error')}</p>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => refetch()}>
          {tCommon('retry')}
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-2">
        <Link href={listPath} className="text-sm font-medium text-action hover:underline">
          ← {t('backToList')}
        </Link>
      </div>

      <PageHeader
        title={`${t('roomLabel')} ${room.roomNumber}`}
        description={room.roomType?.name}
        actions={<StatusBadge status={room.derivedStatus} />}
      />

      <div className="flex flex-wrap gap-2 border-b border-border pb-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-t-btn px-3 py-2 text-sm font-medium transition ${
              tab === item.id
                ? 'border-b-2 border-action text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold text-ink">{t('currentGuest')}</h2>
            <div className="mt-3">
              {room.occupancy ? (
                <RoomOccupancySection occupancy={room.occupancy} />
              ) : (
                <p className="text-sm text-ink-muted">{t('vacant')}</p>
              )}
            </div>
          </Card>
          {room.lastCleaning && (
            <Card>
              <h2 className="text-sm font-semibold text-ink">{t('lastActivity')}</h2>
              <p className="mt-2 text-sm text-ink">
                {formatUserWithTitlePrefix(room.lastCleaning.by.name, room.lastCleaning.by.titlePrefix)}
              </p>
              <p className="text-xs text-ink-muted">{formatWhen(room.lastCleaning.at)}</p>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-2xl font-semibold text-ink">{data.guestStays.length}</p>
              <p className="text-xs text-ink-muted">{t('guestStayCount')}</p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold text-ink">{data.inspections.length}</p>
              <p className="text-xs text-ink-muted">{t('inspectionCount')}</p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold text-ink">{data.photos.length}</p>
              <p className="text-xs text-ink-muted">{t('photoCount')}</p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold text-ink">{data.damages.length + data.lostFound.length}</p>
              <p className="text-xs text-ink-muted">{t('issueCount')}</p>
            </Card>
          </div>
        </div>
      )}

      {tab === 'guests' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('dateFrom')}</label>
              <input
                type="date"
                className="mt-1 block min-h-[44px] rounded-btn border border-border bg-surface px-3 text-sm"
                value={guestFrom}
                onChange={(e) => setGuestFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('dateTo')}</label>
              <input
                type="date"
                className="mt-1 block min-h-[44px] rounded-btn border border-border bg-surface px-3 text-sm"
                value={guestTo}
                onChange={(e) => setGuestTo(e.target.value)}
              />
            </div>
          </div>
          {data.guestStays.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noGuests')}</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-muted/50 text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">{t('guest')}</th>
                    <th className="px-4 py-3">{t('arrival')}</th>
                    <th className="px-4 py-3">{t('departure')}</th>
                    <th className="px-4 py-3">{t('status')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.guestStays.map((stay) => (
                    <tr key={stay.reservationId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">
                        {stay.mainGuestName ?? t('unknownGuest')}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{formatDate(stay.arrivalDate)}</td>
                      <td className="px-4 py-3 text-ink-muted">{formatDate(stay.departureDate)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            stay.presence === 'in_house'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-surface-muted text-ink-muted'
                          }`}
                        >
                          {stay.presence === 'in_house' ? t('inHouse') : t('departed')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canViewReservations && (
                          <Link
                            href={`${reservationsPath}/${stay.reservationId}`}
                            className="text-sm font-medium text-action hover:underline"
                          >
                            {tCommon('open')}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'cleaning' && (
        <div className="space-y-3">
          {cleaningTimeline.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noCleaning')}</p>
          ) : (
            cleaningTimeline.map((row) => (
              <Card key={row.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{row.label}</p>
                    <p className="text-sm text-ink-muted">{row.user}</p>
                  </div>
                  <p className="text-xs text-ink-muted">{formatWhen(row.at)}</p>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'photos' && (
        <RoomPhotoTimeline photos={data.photos} roomNumber={room.roomNumber} />
      )}

      {tab === 'damages' && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.damages.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noDamages')}</p>
          ) : (
            data.damages.map((d) => (
              <Card key={d.id}>
                <div className="flex gap-3">
                  {d.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photoUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{damageLabel(d.damageType)}</p>
                    <p className="mt-1 text-sm text-ink-muted line-clamp-3">{d.description}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      {formatUserWithTitlePrefix(d.reportedBy.name, d.reportedBy.titlePrefix)} ·{' '}
                      {formatWhen(d.reportedAt)}
                    </p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{d.status}</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'lostFound' && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.lostFound.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noLostFound')}</p>
          ) : (
            data.lostFound.map((item) => (
              <Card key={item.id}>
                <div className="flex gap-3">
                  {item.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photoUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{item.description}</p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{item.status}</p>
                    {item.storedLocation && (
                      <p className="mt-1 text-xs text-ink-muted">
                        {t('storedAt')}: {item.storedLocation}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-ink-muted">
                      {formatUserWithTitlePrefix(item.reportedBy.name, item.reportedBy.titlePrefix)} ·{' '}
                      {formatWhen(item.foundAt ?? item.createdAt)}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </PageShell>
  );
}
