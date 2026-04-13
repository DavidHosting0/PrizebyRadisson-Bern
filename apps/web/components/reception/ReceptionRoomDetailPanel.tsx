'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { StatusBadge } from '@/components/StatusBadge';
import {
  RoomDetailInsights,
  type LastCleaningDto,
  type LastCleaningPhotoDto,
} from '@/components/rooms/RoomDetailInsights';

type Task = { id: string; label: string; status: string };
type RoomDetail = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  notes: string | null;
  outOfOrder: boolean;
  oooReason: string | null;
  oooUntil: string | null;
  checklist: { tasks: Task[] } | null;
  lastCleaningPhoto?: LastCleaningPhotoDto;
  lastCleaning?: LastCleaningDto;
};

type AssignmentRow = {
  roomId: string;
  housekeeper: { id: string; name: string; titlePrefix: string };
};

export function ReceptionRoomDetailPanel({
  roomId,
  open,
  onClose,
}: {
  roomId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: room, isLoading } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api<RoomDetail>(`/rooms/${roomId}`),
    enabled: open && !!roomId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => api<AssignmentRow[]>('/assignments'),
    enabled: open && !!roomId,
  });

  const assign = roomId ? assignments.find((a) => a.roomId === roomId) : undefined;

  if (!open || !roomId) return null;

  const tasks = room?.checklist?.tasks ?? [];
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'COMPLETED').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-ink/25" aria-label="Close" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-lift">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">
              Room {room?.roomNumber ?? '…'}
              {room?.floor != null && (
                <span className="ml-2 text-sm font-normal text-ink-muted">· Floor {room.floor}</span>
              )}
            </h2>
            {room && <StatusBadge status={room.derivedStatus} />}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-ink-muted hover:bg-surface-muted"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
          {room && (
            <div className="space-y-6">
              {room.outOfOrder && (
                <p className="rounded-btn border border-warning/40 bg-warning-muted px-3 py-2 text-sm text-ink">
                  Out of order
                </p>
              )}
              <RoomDetailInsights
                roomId={room.id}
                roomNumber={room.roomNumber}
                lastCleaningPhoto={room.lastCleaningPhoto ?? null}
                lastCleaning={room.lastCleaning ?? null}
                outOfOrder={room.outOfOrder}
                oooReason={room.oooReason}
                oooUntil={room.oooUntil}
                maintenanceReadOnly
              />
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Cleaning progress</h3>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {done}/{total} tasks · {pct}%
                </p>
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Assigned to</h3>
                <p className="mt-2 text-sm font-medium text-ink">
                  {assign
                    ? formatUserWithTitlePrefix(assign.housekeeper.name, assign.housekeeper.titlePrefix)
                    : '— Unassigned'}
                </p>
              </section>
              {room.notes && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Notes</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{room.notes}</p>
                </section>
              )}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Checklist</h3>
                <ul className="mt-2 space-y-1 text-sm text-ink">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2 border-b border-border/60 py-1.5">
                      <span>{t.label}</span>
                      <span className="text-ink-muted">{t.status.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
