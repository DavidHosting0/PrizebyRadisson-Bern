'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
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
import { AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';

type TabId = 'overview' | 'guests' | 'cleaning' | 'photos' | 'damages' | 'lostFound';

type Props = {
  roomId: string;
  listPath: '/s/room-management' | '/r/room-management';
  reservationsPath?: string;
  tone?: 'light' | 'dark';
  onEnterMobile?: () => void;
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

export function RoomManagementDetail({
  roomId,
  listPath,
  reservationsPath = '/r/reservations',
  tone = 'light',
  onEnterMobile,
}: Props) {
  const dark = tone === 'dark';
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

  const mutedText = dark ? 'text-sidebar-muted' : 'text-ink-muted';
  const bodyText = dark ? 'text-white' : 'text-ink';
  if (isLoading) {
    return (
      <Shell tone={tone} title={t('roomLabel')} onEnterMobile={onEnterMobile}>
        <p className={clsx('text-sm', mutedText)}>{tCommon('loading')}</p>
      </Shell>
    );
  }

  if (isError || !data || !room) {
    return (
      <Shell tone={tone} title={t('roomLabel')} onEnterMobile={onEnterMobile}>
        <p className={clsx('text-sm', mutedText)}>{tCommon('error')}</p>
        <Button
          type="button"
          variant="secondary"
          className={clsx('mt-3', dark && 'border border-sidebar-border bg-transparent text-white hover:bg-white/10')}
          onClick={() => refetch()}
        >
          {tCommon('retry')}
        </Button>
      </Shell>
    );
  }

  return (
    <Shell
      tone={tone}
      title={`${t('roomLabel')} ${room.roomNumber}`}
      description={room.roomType?.name}
      actions={<StatusBadge status={room.derivedStatus} variant={dark ? 'dark' : 'default'} />}
      onEnterMobile={onEnterMobile}
    >
      <div className="mb-2">
        <Link href={listPath} className="text-sm font-medium text-action hover:underline">
          ← {t('backToList')}
        </Link>
      </div>

      <div className={clsx('flex flex-wrap gap-2 border-b pb-1', dark ? 'border-sidebar-border/60' : 'border-border')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={clsx(
              'rounded-t-btn px-3 py-2 text-sm font-medium transition',
              tab === item.id
                ? dark
                  ? 'border-b-2 border-action text-white'
                  : 'border-b-2 border-action text-ink'
                : dark
                  ? 'text-sidebar-muted hover:text-white'
                  : 'text-ink-muted hover:text-ink',
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <CardOrDiv dark={dark}>
            <h2 className={clsx('text-sm font-semibold', bodyText)}>{t('currentGuest')}</h2>
            <div className="mt-3">
              {room.occupancy ? (
                <RoomOccupancySection occupancy={room.occupancy} />
              ) : (
                <p className={clsx('text-sm', mutedText)}>{t('vacant')}</p>
              )}
            </div>
          </CardOrDiv>
          {room.lastCleaning && (
            <CardOrDiv dark={dark}>
              <h2 className={clsx('text-sm font-semibold', bodyText)}>{t('lastActivity')}</h2>
              <p className={clsx('mt-2 text-sm', bodyText)}>
                {formatUserWithTitlePrefix(room.lastCleaning.by.name, room.lastCleaning.by.titlePrefix)}
              </p>
              <p className={clsx('text-xs', mutedText)}>{formatWhen(room.lastCleaning.at)}</p>
            </CardOrDiv>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CardOrDiv dark={dark}>
              <p className={clsx('text-2xl font-semibold', bodyText)}>{data.guestStays.length}</p>
              <p className={clsx('text-xs', mutedText)}>{t('guestStayCount')}</p>
            </CardOrDiv>
            <CardOrDiv dark={dark}>
              <p className={clsx('text-2xl font-semibold', bodyText)}>{data.inspections.length}</p>
              <p className={clsx('text-xs', mutedText)}>{t('inspectionCount')}</p>
            </CardOrDiv>
            <CardOrDiv dark={dark}>
              <p className={clsx('text-2xl font-semibold', bodyText)}>{data.photos.length}</p>
              <p className={clsx('text-xs', mutedText)}>{t('photoCount')}</p>
            </CardOrDiv>
            <CardOrDiv dark={dark}>
              <p className={clsx('text-2xl font-semibold', bodyText)}>{data.damages.length + data.lostFound.length}</p>
              <p className={clsx('text-xs', mutedText)}>{t('issueCount')}</p>
            </CardOrDiv>
          </div>
        </div>
      )}

      {tab === 'guests' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <label className={clsx('text-xs font-medium uppercase tracking-wide', mutedText)}>{t('dateFrom')}</label>
              <div className="mt-1 min-w-[11rem]">
                <DateInput value={guestFrom} onChange={(e) => setGuestFrom(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={clsx('text-xs font-medium uppercase tracking-wide', mutedText)}>{t('dateTo')}</label>
              <div className="mt-1 min-w-[11rem]">
                <DateInput value={guestTo} onChange={(e) => setGuestTo(e.target.value)} />
              </div>
            </div>
          </div>
          {data.guestStays.length === 0 ? (
            <p className={clsx('text-sm', mutedText)}>{t('noGuests')}</p>
          ) : (
            <div className={clsx('overflow-x-auto rounded-card border', dark ? 'border-sidebar-border/60' : 'border-border')}>
              <table className="min-w-full text-left text-sm">
                <thead
                  className={clsx(
                    'border-b text-xs uppercase tracking-wide',
                    dark ? 'border-sidebar-border/60 bg-white/5 text-sidebar-muted' : 'border-border bg-surface-muted/50 text-ink-muted',
                  )}
                >
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
                    <tr
                      key={stay.id}
                      className={clsx('border-b last:border-0', dark ? 'border-sidebar-border/40' : 'border-border')}
                    >
                      <td className={clsx('px-4 py-3 font-medium', bodyText)}>
                        {stay.mainGuestName ?? t('unknownGuest')}
                      </td>
                      <td className={clsx('px-4 py-3', mutedText)}>{formatDate(stay.arrivalDate)}</td>
                      <td className={clsx('px-4 py-3', mutedText)}>{formatDate(stay.departureDate)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            stay.presence === 'in_house'
                              ? dark
                                ? 'bg-emerald-500/20 text-emerald-200'
                                : 'bg-emerald-100 text-emerald-800'
                              : dark
                                ? 'bg-white/10 text-sidebar-muted'
                                : 'bg-surface-muted text-ink-muted',
                          )}
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
            <p className={clsx('text-sm', mutedText)}>{t('noCleaning')}</p>
          ) : (
            cleaningTimeline.map((row) => (
              <CardOrDiv key={row.id} dark={dark}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className={clsx('font-medium', bodyText)}>{row.label}</p>
                    <p className={clsx('text-sm', mutedText)}>{row.user}</p>
                  </div>
                  <p className={clsx('text-xs', mutedText)}>{formatWhen(row.at)}</p>
                </div>
              </CardOrDiv>
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
            <p className={clsx('text-sm', mutedText)}>{t('noDamages')}</p>
          ) : (
            data.damages.map((d) => (
              <CardOrDiv key={d.id} dark={dark}>
                <div className="flex gap-3">
                  {d.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photoUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={clsx('font-medium', bodyText)}>{damageLabel(d.damageType)}</p>
                    <p className={clsx('mt-1 text-sm line-clamp-3', mutedText)}>{d.description}</p>
                    <p className={clsx('mt-2 text-xs', mutedText)}>
                      {formatUserWithTitlePrefix(d.reportedBy.name, d.reportedBy.titlePrefix)} ·{' '}
                      {formatWhen(d.reportedAt)}
                    </p>
                    <p className={clsx('mt-1 text-xs font-medium uppercase tracking-wide', mutedText)}>{d.status}</p>
                  </div>
                </div>
              </CardOrDiv>
            ))
          )}
        </div>
      )}

      {tab === 'lostFound' && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.lostFound.length === 0 ? (
            <p className={clsx('text-sm', mutedText)}>{t('noLostFound')}</p>
          ) : (
            data.lostFound.map((item) => (
              <CardOrDiv key={item.id} dark={dark}>
                <div className="flex gap-3">
                  {item.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photoUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={clsx('font-medium', bodyText)}>{item.description}</p>
                    <p className={clsx('mt-2 text-xs font-medium uppercase tracking-wide', mutedText)}>{item.status}</p>
                    {item.storedLocation && (
                      <p className={clsx('mt-1 text-xs', mutedText)}>
                        {t('storedAt')}: {item.storedLocation}
                      </p>
                    )}
                    <p className={clsx('mt-2 text-xs', mutedText)}>
                      {formatUserWithTitlePrefix(item.reportedBy.name, item.reportedBy.titlePrefix)} ·{' '}
                      {formatWhen(item.foundAt ?? item.createdAt)}
                    </p>
                  </div>
                </div>
              </CardOrDiv>
            ))
          )}
        </div>
      )}
    </Shell>
  );
}

function CardOrDiv({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  if (dark) {
    return <div className={clsx(APP_DARK_CARD, 'p-5')}>{children}</div>;
  }
  return <Card>{children}</Card>;
}

function Shell({
  tone,
  title,
  description,
  actions,
  onEnterMobile,
  children,
}: {
  tone: 'light' | 'dark';
  title: string;
  description?: string;
  actions?: React.ReactNode;
  onEnterMobile?: () => void;
  children: React.ReactNode;
}) {
  if (tone === 'dark') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader
          tone="dark"
          title={title}
          description={description}
          actions={
            <>
              <AppChromeTools onEnterMobile={onEnterMobile} />
              {actions}
            </>
          }
        />
        <AppPageBody>
          <div className="space-y-6 p-4 md:p-6">{children}</div>
        </AppPageBody>
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </PageShell>
  );
}
