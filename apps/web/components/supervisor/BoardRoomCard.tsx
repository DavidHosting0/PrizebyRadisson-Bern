'use client';

import clsx from 'clsx';
import { StatusBadge } from '@/components/StatusBadge';
import {
  RoomOccupancyBadges,
  RoomOccupancyGuestLine,
} from '@/components/rooms/RoomOccupancyDisplay';
import type { RoomOccupancy } from '@housekeeping/shared';

export type BoardRoom = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  occupancy?: RoomOccupancy | null;
};

/** Visual tile category on the assignment board. */
export type BoardTileKind = 'default' | 'departure' | 'restant' | 'public';

const TILE: Record<
  BoardTileKind,
  {
    card: string;
    accent: string;
    title: string;
    grip: string;
    link: string;
    badgeRestant: string;
    badgeOverdue: string;
    ghost: string;
    ghostMuted: string;
  }
> = {
  default: {
    card: 'border-sidebar-border/10 bg-white hover:border-action/25',
    accent: 'bg-gradient-to-b from-action to-sidebar',
    title: 'text-ink',
    grip: 'text-sidebar-muted/70 group-hover:text-action',
    link: 'text-action',
    badgeRestant: 'bg-action-muted text-action',
    badgeOverdue: 'bg-red-100 text-red-700',
    ghost: 'border-white/15 bg-sidebar ring-action/40',
    ghostMuted: 'text-sidebar-muted',
  },
  departure: {
    card: 'border-red-950/40 bg-[#6B2424] hover:border-red-400/40 hover:brightness-110',
    accent: 'bg-gradient-to-b from-red-400 to-red-950',
    title: 'text-red-50',
    grip: 'text-red-200/70 group-hover:text-red-100',
    link: 'text-red-100',
    badgeRestant: 'bg-black/20 text-red-100',
    badgeOverdue: 'bg-black/30 text-amber-100',
    ghost: 'border-red-300/30 bg-[#6B2424] ring-red-400/50',
    ghostMuted: 'text-red-200/80',
  },
  restant: {
    card: 'border-amber-900/20 bg-[#C9B56A] hover:border-amber-800/35 hover:brightness-[1.03]',
    accent: 'bg-gradient-to-b from-amber-200 to-amber-800',
    title: 'text-amber-950',
    grip: 'text-amber-950/55 group-hover:text-amber-950',
    link: 'text-amber-950',
    badgeRestant: 'bg-amber-950/15 text-amber-950',
    badgeOverdue: 'bg-red-800/15 text-red-900',
    ghost: 'border-amber-900/25 bg-[#C9B56A] ring-amber-700/40',
    ghostMuted: 'text-amber-950/70',
  },
  public: {
    card: 'border-teal-950/40 bg-[#0D5C63] hover:border-teal-300/35 hover:brightness-110',
    accent: 'bg-gradient-to-b from-teal-300 to-teal-950',
    title: 'text-teal-50',
    grip: 'text-teal-100/70 group-hover:text-teal-50',
    link: 'text-teal-100',
    badgeRestant: 'bg-black/20 text-teal-50',
    badgeOverdue: 'bg-black/30 text-amber-100',
    ghost: 'border-teal-200/30 bg-[#0D5C63] ring-teal-300/45',
    ghostMuted: 'text-teal-100/75',
  },
};

export function boardTileKindForRoom(
  room: BoardRoom,
  isRestant?: boolean,
): BoardTileKind {
  if (room.occupancy?.isDepartureToday) return 'departure';
  if (isRestant || room.occupancy?.isRestant) return 'restant';
  return 'default';
}

export function BoardRoomCard({
  room,
  onOpen,
  draggable,
  isRestant,
  overdueDays,
  tileKind: tileKindProp,
  onPointerDownDrag,
  dragging,
  ghost,
}: {
  room: BoardRoom;
  onOpen?: () => void;
  draggable?: boolean;
  isRestant?: boolean;
  overdueDays?: number | null;
  tileKind?: BoardTileKind;
  onPointerDownDrag?: (e: React.PointerEvent, room: BoardRoom) => void;
  dragging?: boolean;
  ghost?: boolean;
}) {
  const kind = tileKindProp ?? boardTileKindForRoom(room, isRestant);
  const t = TILE[kind];
  const onDark = kind === 'departure' || kind === 'public';

  if (ghost) {
    return (
      <div
        className={clsx(
          'pointer-events-none w-[240px] select-none rounded-card px-3.5 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.45)] ring-1',
          t.ghost,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={clsx('text-lg font-semibold tracking-tight', t.title)}>
            {room.roomNumber}
          </span>
          <span
            className={clsx(
              'rounded-btn px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              onDark || kind === 'restant' ? 'bg-black/15' : 'bg-white/10',
              t.ghostMuted,
            )}
          >
            {kind === 'departure'
              ? 'Depart'
              : kind === 'restant'
                ? 'Restant'
                : room.derivedStatus.replace(/_/g, ' ')}
          </span>
        </div>
        {room.floor != null && (
          <p className={clsx('mt-1 text-[11px]', t.ghostMuted)}>Floor {room.floor}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'group relative overflow-hidden rounded-card border shadow-[0_1px_2px_rgba(26,35,50,0.05)] transition-all duration-200',
        'hover:shadow-[0_8px_24px_rgba(26,35,50,0.12)]',
        t.card,
        dragging && 'opacity-35 scale-[0.98]',
        draggable && 'cursor-grab touch-none active:cursor-grabbing',
      )}
      onPointerDown={
        draggable && onPointerDownDrag
          ? (e) => {
              if (e.button !== 0) return;
              onPointerDownDrag(e, room);
            }
          : undefined
      }
      role={onOpen && !draggable ? 'button' : undefined}
      tabIndex={onOpen && !draggable ? 0 : undefined}
      onClick={onOpen && !draggable ? () => onOpen() : undefined}
    >
      <div className={clsx('absolute inset-y-0 left-0 w-1', t.accent)} aria-hidden />
      <div className="flex gap-2 p-3 pl-3.5">
        {draggable && (
          <div
            className={clsx(
              'flex shrink-0 flex-col items-center justify-center self-stretch rounded-btn px-1 transition',
              t.grip,
            )}
            title="Drag to assign"
            aria-hidden
          >
            <span className="text-[11px] leading-none tracking-tighter">⋮⋮</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={clsx('text-lg font-semibold tracking-tight', t.title)}>
              {room.roomNumber}
            </span>
            <StatusBadge status={room.derivedStatus} variant={onDark ? 'onColor' : 'default'} />
          </div>
          {(kind === 'departure' ||
            kind === 'restant' ||
            (overdueDays != null && overdueDays > 0)) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {kind === 'departure' && (
                <span className="rounded-btn bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-50">
                  Depart
                </span>
              )}
              {kind === 'restant' && (
                <span
                  className={clsx(
                    'rounded-btn px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    t.badgeRestant,
                  )}
                >
                  Restant
                </span>
              )}
              {overdueDays != null && overdueDays > 0 && (
                <span
                  className={clsx(
                    'rounded-btn px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    t.badgeOverdue,
                  )}
                >
                  Overdue {overdueDays}d
                </span>
              )}
            </div>
          )}
          <RoomOccupancyGuestLine occupancy={room.occupancy} onColor={onDark} />
          <RoomOccupancyBadges occupancy={room.occupancy} onColor={onDark} />
          {onOpen && (
            <button
              type="button"
              className={clsx(
                'mt-2 text-xs font-medium opacity-80 transition hover:opacity-100',
                t.link,
              )}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              Open details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
