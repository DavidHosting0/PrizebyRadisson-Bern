'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReservationListItem, GuideListItemDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { hasPermission } from '@/lib/permission-routes';
import type { Me } from '@/lib/api';
import { roomsListQueryOptions, type RoomListRow } from '@/lib/rooms-query';
import { fuzzyMatch, type CommandItem } from '@/lib/command-registry';
import { IconGuide, IconPackage, IconDamage } from '@/components/nav/nav-icons';

const MAX_PER_GROUP = 6;

type LostFoundRow = {
  id: string;
  description: string;
  status: string;
  photoUrl?: string | null;
  room: { roomNumber: string } | null;
  createdAt: string;
};

type DamageRow = {
  id: string;
  description: string;
  status: string;
  photoUrl: string;
  room: { roomNumber: string };
  reportedAt: string;
};

function guestInitials(name: string | null | undefined): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatRelative(iso: string, tToday: string): string {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return tToday;
  if (diffDays === 1) return '1d';
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString();
}

function roomHref(user: Me, roomId: string): string | undefined {
  switch (user.role) {
    case 'RECEPTION':
    case 'ADMIN':
      return '/r/rooms';
    case 'SUPERVISOR':
      return '/s/floor-plan';
    case 'HOUSEKEEPER':
      return `/h/room/${roomId}`;
    case 'TECHNICIAN':
      return '/t/rooms';
    default:
      return undefined;
  }
}

export function useCommandSearch(
  user: Me | null,
  query: string,
  debouncedQuery: string,
  tCmd: (key: string, values?: Record<string, string>) => string,
  tRoomStatus: (key: string) => string,
  onSelectEntity: (item: Omit<CommandItem, 'onSelect'>) => void,
) {
  const q = debouncedQuery.trim();
  const searching = q.length >= 1;

  const { data: rooms = [] } = useQuery({
    ...roomsListQueryOptions<RoomListRow>(),
    enabled: !!user && searching && hasPermission(user, 'ROOMS_READ'),
  });

  const { data: reservations = [], isLoading: resLoading } = useQuery({
    queryKey: ['command-search', 'reservations', q],
    queryFn: () => {
      const params = new URLSearchParams({ tab: 'all', q });
      return api<ReservationListItem[]>(`/reservations?${params}`);
    },
    enabled: !!user && q.length >= 2 && hasPermission(user, 'RESERVATIONS_READ'),
    staleTime: 30_000,
  });

  const { data: lost = [], isLoading: lostLoading } = useQuery({
    queryKey: ['command-search', 'lost-found', q],
    queryFn: () => api<LostFoundRow[]>(`/lost-found?q=${encodeURIComponent(q)}`),
    enabled: !!user && q.length >= 2 && hasPermission(user, 'LOST_FOUND_READ'),
    staleTime: 30_000,
  });

  const { data: damages = [], isLoading: damageLoading } = useQuery({
    queryKey: ['command-search', 'damages', q],
    queryFn: () => api<DamageRow[]>(`/damage-reports?q=${encodeURIComponent(q)}`),
    enabled: !!user && q.length >= 2 && hasPermission(user, 'DAMAGE_REPORT_READ'),
    staleTime: 30_000,
  });

  const { data: guides = [], isLoading: guidesLoading } = useQuery({
    queryKey: ['guides'],
    queryFn: () => api<GuideListItemDto[]>('/guides'),
    enabled: !!user && searching && hasPermission(user, 'GUIDE_READ'),
    staleTime: 60_000,
  });

  const entityItems = useMemo(() => {
    if (!user || !searching) return [] as CommandItem[];
    const items: CommandItem[] = [];

    if (hasPermission(user, 'ROOMS_READ')) {
      rooms
        .filter((r) => fuzzyMatch(q, r.roomNumber, r.derivedStatus))
        .slice(0, MAX_PER_GROUP)
        .forEach((r) => {
          const statusLabel = tRoomStatus(r.derivedStatus);
          const photoHint =
            r.lastPhotoAt != null
              ? tCmd('room.photoAge', { age: formatRelative(r.lastPhotoAt, tCmd('today')) })
              : undefined;
          const subtitle = [
            r.floor != null ? tCmd('room.floor', { floor: String(r.floor) }) : null,
            statusLabel,
            photoHint,
          ]
            .filter(Boolean)
            .join(' · ');
          const base: Omit<CommandItem, 'onSelect'> = {
            id: `room:${r.id}`,
            group: tCmd('groups.rooms'),
            label: tCmd('room.label', { number: r.roomNumber }),
            subtitle,
            imageUrl: r.lastPhotoUrl,
            roomNumber: r.roomNumber,
            roomStatus: r.derivedStatus,
            roomId: r.id,
            href: roomHref(user, r.id),
            keywords: [r.roomNumber, statusLabel],
            action: user.role === 'RECEPTION' || user.role === 'ADMIN' ? 'openRoom' : undefined,
          };
          items.push({
            ...base,
            onSelect: () => onSelectEntity(base),
          });
        });
    }

    if (hasPermission(user, 'RESERVATIONS_READ') && q.length >= 2) {
      reservations.slice(0, MAX_PER_GROUP).forEach((r) => {
        const name = r.mainGuestName ?? r.reservationId;
        const status = r.checkIn
          ? tCmd('guest.inHouse')
          : r.checkInQueue
            ? tCmd('guest.queue')
            : tCmd('guest.arrival');
        const subtitle = [
          r.roomId ? tCmd('room.label', { number: r.roomId }) : null,
          status,
          r.departureDate ? tCmd('guest.until', { date: r.departureDate }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const href = `/r/reservations/${encodeURIComponent(r.reservationId)}`;
        const base = {
          id: `res:${r.reservationId}`,
          group: tCmd('groups.guests'),
          label: name,
          subtitle,
          initials: guestInitials(r.mainGuestName),
          href,
          keywords: [name, r.reservationId, r.roomId ?? ''],
        };
        items.push({
          ...base,
          onSelect: () => onSelectEntity(base),
        });
      });
    }

    if (hasPermission(user, 'LOST_FOUND_READ') && q.length >= 2) {
      lost.slice(0, MAX_PER_GROUP).forEach((lf) => {
        const base = {
          id: `lost:${lf.id}`,
          group: tCmd('groups.lostFound'),
          label: lf.description,
          subtitle: [lf.room?.roomNumber ? tCmd('room.label', { number: lf.room.roomNumber }) : null, lf.status]
            .filter(Boolean)
            .join(' · '),
          imageUrl: lf.photoUrl,
          icon: IconPackage,
          href: user.role === 'SUPERVISOR' ? '/s/lost' : '/r/lost',
          keywords: [lf.description],
        };
        items.push({
          ...base,
          onSelect: () => onSelectEntity(base),
        });
      });
    }

    if (hasPermission(user, 'DAMAGE_REPORT_READ') && q.length >= 2) {
      damages.slice(0, MAX_PER_GROUP).forEach((d) => {
        const base = {
          id: `damage:${d.id}`,
          group: tCmd('groups.damages'),
          label: d.description,
          subtitle: `${tCmd('room.label', { number: d.room.roomNumber })} · ${d.status}`,
          imageUrl: d.photoUrl,
          icon: IconDamage,
          href:
            user.role === 'TECHNICIAN'
              ? '/t/maintenance'
              : user.role === 'SUPERVISOR'
                ? '/s/damages'
                : '/r/damages',
          keywords: [d.description, d.room.roomNumber],
        };
        items.push({
          ...base,
          onSelect: () => onSelectEntity(base),
        });
      });
    }

    if (hasPermission(user, 'GUIDE_READ')) {
      guides
        .filter((g) => fuzzyMatch(q, g.title, g.summary ?? '', g.category ?? ''))
        .slice(0, MAX_PER_GROUP)
        .forEach((g) => {
          const prefix = user.role === 'SUPERVISOR' ? '/s' : '/r';
          const href = `${prefix}/guides/${g.id}`;
          const base = {
            id: `guide:${g.id}`,
            group: tCmd('groups.guides'),
            label: g.title,
            subtitle: g.category ?? g.summary ?? undefined,
            icon: IconGuide,
            href,
            keywords: [g.title, g.category ?? '', g.summary ?? ''],
          };
          items.push({
            ...base,
            onSelect: () => onSelectEntity(base),
          });
        });
    }

    return items;
  }, [
    user,
    searching,
    q,
    rooms,
    reservations,
    lost,
    damages,
    guides,
    tCmd,
    tRoomStatus,
    onSelectEntity,
  ]);

  const loading =
    (q.length >= 2 && !!user && hasPermission(user, 'RESERVATIONS_READ') && resLoading) ||
    (q.length >= 2 && !!user && hasPermission(user, 'LOST_FOUND_READ') && lostLoading) ||
    (q.length >= 2 && !!user && hasPermission(user, 'DAMAGE_REPORT_READ') && damageLoading) ||
    (searching && !!user && hasPermission(user, 'GUIDE_READ') && guidesLoading);

  return { entityItems, loading, searching };
}
