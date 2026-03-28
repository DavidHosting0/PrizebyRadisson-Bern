'use client';

import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';

export type BoardRoom = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  checklist: { tasks: { status: string }[] } | null;
};

export function BoardRoomCard({
  room,
  onOpen,
  draggable,
}: {
  room: BoardRoom;
  onOpen: () => void;
  draggable?: boolean;
}) {
  const total = room.checklist?.tasks.length ?? 0;
  const done = room.checklist?.tasks.filter((t) => t.status === 'COMPLETED').length ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <Card padding className="transition-shadow hover:shadow-lift">
      <div className="flex gap-2">
        {draggable && (
          <div
            className="flex shrink-0 cursor-grab touch-none flex-col items-center justify-center rounded-btn border border-dashed border-border px-1.5 py-3 text-ink-muted active:cursor-grabbing"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/json', JSON.stringify({ roomId: room.id }));
              e.dataTransfer.effectAllowed = 'move';
            }}
            title="Drag to assign"
          >
            <span className="text-[10px] leading-none tracking-tighter">⋮⋮</span>
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          className="min-w-0 flex-1 cursor-pointer outline-none ring-action focus-visible:ring-2"
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen();
            }
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-lg font-semibold text-ink">{room.roomNumber}</span>
            <StatusBadge status={room.derivedStatus} />
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-ink-muted">
              <span>Progress</span>
              <span>
                {done}/{total}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <span className="mt-2 inline-block text-xs font-medium text-action">Open details</span>
        </div>
      </div>
    </Card>
  );
}
