'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  RoomDetailInsights,
  type LastCleaningDto,
  type LastCleaningPhotoDto,
} from '@/components/rooms/RoomDetailInsights';

type Task = {
  id: string;
  label: string;
  code: string;
  status: string;
  supervisorOverride: boolean;
};

type RoomDetail = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  outOfOrder: boolean;
  oooReason: string | null;
  oooUntil: string | null;
  notes: string | null;
  checklist: { stateId: string; tasks: Task[] } | null;
  lastCleaningPhoto?: LastCleaningPhotoDto;
  lastCleaning?: LastCleaningDto;
};

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;

export function RoomSlideOver({
  roomId,
  open,
  onClose,
}: {
  roomId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api<RoomDetail>(`/rooms/${roomId}`),
    enabled: open && !!roomId,
  });

  const [notes, setNotes] = useState('');
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
  });

  const patchTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api(`/rooms/${roomId}/checklist/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, supervisorOverride: true }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  const reopen = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/checklist/reopen`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  if (!open || !roomId) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-ink/30" aria-label="Close" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-lift">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Room {data?.roomNumber ?? '…'}
              {data?.floor != null && (
                <span className="ml-2 text-sm font-normal text-ink-muted">Floor {data.floor}</span>
              )}
            </h2>
            {data && <StatusBadge status={data.derivedStatus} />}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-ink-muted hover:bg-surface-muted"
            onClick={onClose}
            aria-label="Close panel"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
          {data && (
            <div className="space-y-6">
              <RoomDetailInsights
                roomId={data.id}
                roomNumber={data.roomNumber}
                lastCleaningPhoto={data.lastCleaningPhoto ?? null}
                lastCleaning={data.lastCleaning ?? null}
                outOfOrder={data.outOfOrder}
                oooReason={data.oooReason}
                oooUntil={data.oooUntil}
                maintenanceReadOnly={false}
              />

              <Card>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Room notes</h3>
                <textarea
                  className="mt-2 min-h-[88px] w-full rounded-btn border border-border px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes for staff…"
                />
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={() => patchRoom.mutate({ notes: notes || null })}
                  disabled={patchRoom.isPending}
                >
                  Save notes
                </Button>
              </Card>

              <Card>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Maintenance (out of order)</h3>
                <label className="mt-3 flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-border"
                    checked={data.outOfOrder}
                    onChange={(e) => patchRoom.mutate({ outOfOrder: e.target.checked })}
                  />
                  <span className="text-sm text-ink">Mark room out of order</span>
                </label>
                <label className="mt-3 block text-xs font-medium text-ink-muted">
                  Reason
                  <input
                    type="text"
                    className="mt-1 min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink"
                    value={oooReason}
                    onChange={(e) => setOooReason(e.target.value)}
                    placeholder="e.g. AC repair, plumbing…"
                  />
                </label>
                <label className="mt-3 block text-xs font-medium text-ink-muted">
                  Expected back in service
                  <input
                    type="datetime-local"
                    className="mt-1 min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm text-ink"
                    value={oooUntilLocal}
                    onChange={(e) => setOooUntilLocal(e.target.value)}
                  />
                </label>
                <Button
                  variant="secondary"
                  className="mt-3"
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
              </Card>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Checklist</h3>
                <ul className="mt-3 space-y-2">
                  {(data.checklist?.tasks ?? []).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-btn border border-border bg-surface-muted/50 px-3 py-2">
                      <span className="text-sm font-medium text-ink">{t.label}</span>
                      <select
                        className="min-h-[40px] rounded-btn border border-border bg-surface px-2 text-sm"
                        value={t.status}
                        onChange={(e) =>
                          patchTask.mutate({ taskId: t.id, status: e.target.value })
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="danger"
                  className="mt-4"
                  disabled={reopen.isPending || !data.checklist?.tasks?.length}
                  onClick={() => reopen.mutate()}
                >
                  Re-open room (reset checklist)
                </Button>
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
