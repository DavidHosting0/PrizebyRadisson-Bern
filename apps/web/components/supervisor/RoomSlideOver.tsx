'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';
import {
  RoomDetailInsights,
  type LastCleaningDto,
  type LastCleaningPhotoDto,
} from '@/components/rooms/RoomDetailInsights';
import { RoomOccupancySection } from '@/components/rooms/RoomOccupancyDisplay';
import { InspectRoomModal } from '@/components/supervisor/InspectRoomModal';
import type { RoomOccupancy } from '@housekeeping/shared';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { useAuth } from '@/lib/auth-context';
import { hasPermission } from '@/lib/permission-routes';
import { useToast } from '@/components/toast/ToastProvider';
import { formatRoomStatusLabel } from '@/lib/room-status-label';

type RoomDetail = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  outOfOrder: boolean;
  oooReason: string | null;
  oooUntil: string | null;
  notes: string | null;
  cleaningDeclaredAt?: string | null;
  lastCleaningPhoto?: LastCleaningPhotoDto;
  lastCleaning?: LastCleaningDto;
  occupancy?: RoomOccupancy | null;
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

export function RoomSlideOver({
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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api<RoomDetail>(`/rooms/${roomId}`),
    enabled: open && !!roomId,
  });

  const [notes, setNotes] = useState('');
  const [inspectOpen, setInspectOpen] = useState(false);
  const [oooReason, setOooReason] = useState('');
  const [oooUntilLocal, setOooUntilLocal] = useState('');
  useEffect(() => {
    if (data?.notes != null) setNotes(data.notes ?? '');
  }, [data?.notes, roomId]);
  useEffect(() => {
    if (!data) return;
    setOooReason(data.oooReason ?? '');
    if (data.oooUntil) {
      const d = new Date(data.oooUntil);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        setOooUntilLocal(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
        );
      } else setOooUntilLocal('');
    } else setOooUntilLocal('');
  }, [data?.oooReason, data?.oooUntil, roomId]);

  const patchRoom = useMutation({
    mutationFn: (body: {
      notes?: string | null;
      outOfOrder?: boolean;
      oooReason?: string | null;
      oooUntil?: string | null;
    }) => api(`/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      refetch();
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const reopen = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/checklist/reopen`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
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

  const panelRef = useRef<HTMLElement>(null);
  useOverlayKeyboard({ open: open && !!roomId && !inspectOpen, onClose, containerRef: panelRef });

  if (!open || !roomId) return null;

  const current =
    data?.derivedStatus === 'DIRTY' ||
    data?.derivedStatus === 'CLEAN' ||
    data?.derivedStatus === 'INSPECTED'
      ? data.derivedStatus
      : null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-sidebar-border bg-[#1A2332] text-slate-100 shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-sidebar-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight text-white">
              Room {data?.roomNumber ?? '…'}
              {data?.floor != null && (
                <span className="ml-2 text-sm font-normal text-sidebar-muted">· Floor {data.floor}</span>
              )}
            </h2>
            {data && (
              <div className="mt-1.5">
                <StatusBadge status={data.derivedStatus} variant="dark" />
              </div>
            )}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-sidebar-muted hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Close panel"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="sidebar-scroll flex-1 overflow-y-auto p-5">
          {isLoading && <p className="text-sm text-sidebar-muted">Loading…</p>}
          {data && (
            <div className="space-y-5">
              {canSetStatus && !data.outOfOrder && (
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
                roomId={data.id}
                roomNumber={data.roomNumber}
                lastCleaningPhoto={data.lastCleaningPhoto ?? null}
                lastCleaning={data.lastCleaning ?? null}
                outOfOrder={data.outOfOrder}
                oooReason={data.oooReason}
                oooUntil={data.oooUntil}
                maintenanceReadOnly={false}
                tone="dark"
              />

              <RoomOccupancySection occupancy={data.occupancy} tone="dark" />

              <Button
                type="button"
                variant="action"
                className="min-h-[48px] w-full"
                onClick={() => setInspectOpen(true)}
              >
                Inspect room
              </Button>

              <section className={APP_DARK_CARD + ' p-4'}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                  Room notes
                </h3>
                <textarea
                  className={APP_DARK_INPUT + ' mt-2 min-h-[88px] w-full py-2'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes for staff…"
                />
                <Button
                  variant="secondary"
                  className="mt-3 min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
                  onClick={() => patchRoom.mutate({ notes: notes || null })}
                  disabled={patchRoom.isPending}
                >
                  Save notes
                </Button>
              </section>

              <section className={APP_DARK_CARD + ' p-4'}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                  Maintenance (out of order)
                </h3>
                <label className="mt-3 flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-sidebar-border bg-sidebar text-action focus:ring-action/40"
                    checked={data.outOfOrder}
                    onChange={(e) => patchRoom.mutate({ outOfOrder: e.target.checked })}
                  />
                  <span className="text-sm text-slate-100">Mark room out of order</span>
                </label>
                <label className="mt-3 block text-xs font-medium text-sidebar-muted">
                  Reason
                  <input
                    type="text"
                    className={APP_DARK_INPUT + ' mt-1 min-h-[44px] w-full'}
                    value={oooReason}
                    onChange={(e) => setOooReason(e.target.value)}
                    placeholder="e.g. AC repair, plumbing…"
                  />
                </label>
                <label className="mt-3 block text-xs font-medium text-sidebar-muted">
                  Expected back in service
                  <div className="mt-1">
                    <DateInput
                      type="datetime-local"
                      value={oooUntilLocal}
                      onChange={(e) => setOooUntilLocal(e.target.value)}
                    />
                  </div>
                </label>
                <Button
                  variant="secondary"
                  className="mt-3 min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
                  disabled={patchRoom.isPending}
                  onClick={() =>
                    patchRoom.mutate({
                      oooReason: oooReason.trim() || null,
                      oooUntil: oooUntilLocal ? new Date(oooUntilLocal).toISOString() : null,
                    })
                  }
                >
                  Save maintenance details
                </Button>
              </section>

              <section className={APP_DARK_CARD + ' p-4'}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                  Cleaning
                </h3>
                <p className="mt-2 text-sm text-sidebar-muted">
                  {data.cleaningDeclaredAt
                    ? 'Room was marked clean. Re-open if the attendant needs to clean again.'
                    : 'No per-room checklist — attendants mark the room clean when finished.'}
                </p>
                <Button
                  variant="danger"
                  className="mt-4 min-h-[44px] border-0 bg-red-600 text-white hover:bg-red-700"
                  disabled={reopen.isPending || !data.cleaningDeclaredAt}
                  onClick={() => reopen.mutate()}
                >
                  Re-open room
                </Button>
              </section>
            </div>
          )}
        </div>
      </aside>
      {data && (
        <InspectRoomModal
          open={inspectOpen}
          onClose={() => setInspectOpen(false)}
          roomId={data.id}
          roomNumber={data.roomNumber}
        />
      )}
    </>
  );
}
