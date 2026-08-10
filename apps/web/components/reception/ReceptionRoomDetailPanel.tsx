'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { StatusBadge } from '@/components/StatusBadge';
import {
  RoomDetailInsights,
  type LastCleaningDto,
  type LastCleaningPhotoDto,
} from '@/components/rooms/RoomDetailInsights';
import { RoomOccupancySection } from '@/components/rooms/RoomOccupancyDisplay';
import type { RoomOccupancy } from '@housekeeping/shared';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { useAuth } from '@/lib/auth-context';
import { hasPermission } from '@/lib/permission-routes';
import { useToast } from '@/components/toast/ToastProvider';
import { formatRoomStatusLabel } from '@/lib/room-status-label';
import clsx from 'clsx';

type RoomDetail = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  notes: string | null;
  outOfOrder: boolean;
  oooReason: string | null;
  oooUntil: string | null;
  lastCleaningPhoto?: LastCleaningPhotoDto;
  lastCleaning?: LastCleaningDto;
  occupancy?: RoomOccupancy | null;
};

type AssignmentRow = {
  roomId: string;
  housekeeper: { id: string; name: string; titlePrefix: string };
};

const STATUS_OPTIONS = [
  { value: 'DIRTY' as const, label: 'Schmutzig', activeClass: 'border-red-400/50 bg-red-500/25 text-red-100' },
  { value: 'CLEAN' as const, label: 'Sauber', activeClass: 'border-orange-400/50 bg-orange-500/25 text-orange-100' },
  { value: 'INSPECTED' as const, label: 'Inspeziert', activeClass: 'border-emerald-400/50 bg-emerald-500/25 text-emerald-100' },
];

function parseApiError(raw: string): string {
  try {
    const j = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join(', ');
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* plain text */
  }
  return raw || 'Request failed';
}

export function ReceptionRoomDetailPanel({
  roomId,
  open,
  onClose,
}: {
  roomId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canSetStatus = hasPermission(user, 'ROOM_STATUS_WRITE');

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

  const setStatusMut = useMutation({
    mutationFn: (status: 'DIRTY' | 'CLEAN' | 'INSPECTED') =>
      api<RoomDetail>(`/rooms/${roomId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (next) => {
      qc.setQueryData(['room', roomId], next);
      void qc.invalidateQueries({ queryKey: ['rooms'] });
      toast.push(
        `Zimmer ${next.roomNumber}: ${formatRoomStatusLabel(next.derivedStatus)}`,
        'success',
      );
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const assign = roomId ? assignments.find((a) => a.roomId === roomId) : undefined;
  const panelRef = useRef<HTMLElement>(null);
  useOverlayKeyboard({ open: open && !!roomId, onClose, containerRef: panelRef });

  if (!open || !roomId) return null;

  const current =
    room?.derivedStatus === 'DIRTY' ||
    room?.derivedStatus === 'CLEAN' ||
    room?.derivedStatus === 'INSPECTED'
      ? room.derivedStatus
      : null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/50" aria-label="Close" onClick={onClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-sidebar-border bg-[#1A2332] text-slate-100 shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-sidebar-border/60 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Room {room?.roomNumber ?? '…'}
              {room?.floor != null && (
                <span className="ml-2 text-sm font-normal text-sidebar-muted">· Floor {room.floor}</span>
              )}
            </h2>
            {room && <StatusBadge status={room.derivedStatus} />}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-sidebar-muted hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="sidebar-scroll flex-1 overflow-y-auto p-5">
          {isLoading && <p className="text-sm text-sidebar-muted">Loading…</p>}
          {room && (
            <div className="space-y-6">
              {room.outOfOrder && (
                <p className="rounded-btn border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
                  Out of order
                </p>
              )}
              {canSetStatus && !room.outOfOrder && (
                <section className={APP_DARK_CARD + ' p-4'}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                    Zimmerstatus
                  </h3>
                  <p className="mt-1 text-xs text-sidebar-muted">
                    Ändert den Status in PrizeBern und synchronisiert nach EMMA.
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {STATUS_OPTIONS.map((opt) => {
                      const active = current === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={setStatusMut.isPending || active}
                          onClick={() => setStatusMut.mutate(opt.value)}
                          className={clsx(
                            'rounded-btn border px-2 py-2.5 text-center text-xs font-semibold transition',
                            active
                              ? opt.activeClass
                              : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10',
                            setStatusMut.isPending && 'opacity-60',
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
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
                tone="dark"
              />
              <RoomOccupancySection occupancy={room.occupancy} tone="dark" />
              <section className={APP_DARK_CARD + ' p-4'}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Assigned to</h3>
                <p className="mt-2 text-sm font-medium text-white">
                  {assign
                    ? formatUserWithTitlePrefix(assign.housekeeper.name, assign.housekeeper.titlePrefix)
                    : '— Unassigned'}
                </p>
              </section>
              {room.notes && (
                <section className={APP_DARK_CARD + ' p-4'}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Notes</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{room.notes}</p>
                </section>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
