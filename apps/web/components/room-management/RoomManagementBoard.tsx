'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';
import {
  RoomOccupancyBadges,
  RoomOccupancyGuestLine,
} from '@/components/rooms/RoomOccupancyDisplay';
import type { RoomOccupancy } from '@housekeeping/shared';

export type RoomBoardRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  occupancy?: RoomOccupancy | null;
};

type Props = {
  basePath: '/s/room-management' | '/r/room-management';
};

export function RoomManagementBoard({ basePath }: Props) {
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('filterFloor')}</label>
          <select
            className="mt-1 min-h-[44px] min-w-[120px] rounded-btn border border-border bg-surface px-3 text-sm"
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
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('filterStatus')}</label>
          <select
            className="mt-1 min-h-[44px] min-w-[160px] rounded-btn border border-border bg-surface px-3 text-sm"
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
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{tCommon('search')}</label>
          <input
            type="search"
            className="mt-1 min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">{tCommon('loading')}</p>}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-ink-muted">{t('noRooms')}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((room) => (
          <Link key={room.id} href={`${basePath}/${room.id}`} className="block">
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
          </Link>
        ))}
      </div>
    </div>
  );
}
