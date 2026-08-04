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
  checklist: { tasks: { status: string }[] } | null;
  occupancy?: RoomOccupancy | null;
};

export function BoardRoomCard({
  room,
  onOpen,
  draggable,
  isRestant,
  overdueDays,
  onPointerDownDrag,
  dragging,
  ghost,
}: {
  room: BoardRoom;
  onOpen?: () => void;
  draggable?: boolean;
  isRestant?: boolean;
  overdueDays?: number | null;
  onPointerDownDrag?: (e: React.PointerEvent, room: BoardRoom) => void;
  dragging?: boolean;
  ghost?: boolean;
}) {
  const total = room.checklist?.tasks.length ?? 0;
  const done = room.checklist?.tasks.filter((t) => t.status === 'COMPLETED').length ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  if (ghost) {
    return (
      <div className="pointer-events-none w-[240px] select-none rounded-card border border-white/15 bg-sidebar px-3.5 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.45)] ring-1 ring-action/40">
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-semibold tracking-tight text-white">{room.roomNumber}</span>
          <span className="rounded-btn bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
            {room.derivedStatus.replace(/_/g, ' ')}
          </span>
        </div>
        {room.floor != null && (
          <p className="mt-1 text-[11px] text-sidebar-muted">Floor {room.floor}</p>
        )}
        {(isRestant || (overdueDays != null && overdueDays > 0)) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {isRestant && (
              <span className="rounded-btn bg-sky-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-200">
                Restant
              </span>
            )}
            {overdueDays != null && overdueDays > 0 && (
              <span className="rounded-btn bg-red-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-200">
                Overdue {overdueDays}d
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'group relative overflow-hidden rounded-card border border-sidebar-border/10 bg-white shadow-[0_1px_2px_rgba(26,35,50,0.05)] transition-all duration-200',
        'hover:border-action/25 hover:shadow-[0_8px_24px_rgba(26,35,50,0.1)]',
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
      onClick={
        onOpen && !draggable
          ? () => onOpen()
          : undefined
      }
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-action to-sidebar" aria-hidden />
      <div className="flex gap-2 p-3 pl-3.5">
        {draggable && (
          <div
            className="flex shrink-0 flex-col items-center justify-center self-stretch rounded-btn px-1 text-sidebar-muted/70 transition group-hover:text-action"
            title="Drag to assign"
            aria-hidden
          >
            <span className="text-[11px] leading-none tracking-tighter">⋮⋮</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-lg font-semibold tracking-tight text-ink">{room.roomNumber}</span>
            <StatusBadge status={room.derivedStatus} />
          </div>
          {(isRestant || (overdueDays != null && overdueDays > 0)) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {isRestant && (
                <span className="rounded-btn bg-action-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-action">
                  Restant
                </span>
              )}
              {overdueDays != null && overdueDays > 0 && (
                <span className="rounded-btn bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                  Overdue {overdueDays}d
                </span>
              )}
            </div>
          )}
          <RoomOccupancyGuestLine occupancy={room.occupancy} />
          <RoomOccupancyBadges occupancy={room.occupancy} />
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-ink-muted">
              <span>Progress</span>
              <span>
                {done}/{total}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-action to-success transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {onOpen && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-action opacity-80 transition hover:opacity-100"
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
