'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';
import {
  RoomOccupancyBadges,
  RoomOccupancyGuestLine,
} from '@/components/rooms/RoomOccupancyDisplay';
import type { RoomOccupancy } from '@housekeeping/shared';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';

export type RoomBoardRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  occupancy?: RoomOccupancy | null;
};

type Props = {
  basePath: '/s/room-management' | '/r/room-management';
  tone?: 'light' | 'dark';
};

export function RoomManagementBoard({ basePath, tone = 'light' }: Props) {
  const dark = tone === 'dark';
  const t = useTranslations('roomManagement');
  const tRoom = useTranslations('room.status');
  const tCommon = useTranslations('common');
  const [floor, setFloor] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data: rooms = [], isLoading } = useQuery(roomsListQueryOptions<RoomBoardRow>());

  const floors = useMemo(() => {
    const set = new Set<number>();
    rooms.forEach((r) => {
      if (r.floor != null) set.add(r.floor);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [rooms]);

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (floor && String(r.floor ?? '') !== floor) return false;
      if (status && r.derivedStatus !== status) return false;
      if (search && !r.roomNumber.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [rooms, floor, status, search]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => set.add(r.derivedStatus));
    return Array.from(set).sort();
  }, [rooms]);

  const labelClass = dark ? 'text-xs font-medium uppercase tracking-wide text-sidebar-muted' : 'text-xs font-medium uppercase tracking-wide text-ink-muted';
  const inputClass = dark ? APP_DARK_INPUT : 'border border-border bg-surface';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className={labelClass}>{t('filterFloor')}</label>
          <select
            className={clsx('mt-1 min-h-[44px] min-w-[120px] rounded-btn px-3 text-sm', inputClass)}
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          >
            <option value="">{tCommon('all')}</option>
            {floors.map((f) => (
              <option key={f} value={String(f)}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t('filterStatus')}</label>
          <select
            className={clsx('mt-1 min-h-[44px] min-w-[160px] rounded-btn px-3 text-sm', inputClass)}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{tCommon('all')}</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {tRoom.has(s) ? tRoom(s) : s}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>{tCommon('search')}</label>
          <input
            type="search"
            className={clsx('mt-1 min-h-[44px] w-full rounded-btn px-3 text-sm', inputClass)}
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <p className={clsx('text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>{tCommon('loading')}</p>}

      {!isLoading && filtered.length === 0 && (
        <p className={clsx('text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>{t('noRooms')}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((room) => (
          <Link key={room.id} href={`${basePath}/${room.id}`} className="block">
            {dark ? (
              <div className={clsx(APP_DARK_CARD, 'h-full p-5 transition hover:border-action/40')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold text-white">{room.roomNumber}</p>
                    {room.floor != null && (
                      <p className="text-xs text-sidebar-muted">
                        {t('floor')} {room.floor}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={room.derivedStatus} variant="dark" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <RoomOccupancyBadges occupancy={room.occupancy} onColor />
                </div>
                <RoomOccupancyGuestLine occupancy={room.occupancy} compact onColor />
              </div>
            ) : (
              <Card className="h-full transition hover:border-action/40 hover:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold text-ink">{room.roomNumber}</p>
                    {room.floor != null && (
                      <p className="text-xs text-ink-muted">
                        {t('floor')} {room.floor}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={room.derivedStatus} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <RoomOccupancyBadges occupancy={room.occupancy} />
                </div>
                <RoomOccupancyGuestLine occupancy={room.occupancy} compact />
              </Card>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
