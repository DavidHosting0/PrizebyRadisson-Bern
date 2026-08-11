'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/toast/ToastProvider';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';

type RoomOpt = { id: string; roomNumber: string };
type TypeOpt = { id: string; label: string; code: string };

const fieldClass = `${APP_DARK_INPUT} mt-1.5 w-full min-h-[44px] px-3 py-2`;
const selectFieldClass = `${APP_DARK_INPUT} mt-1.5 w-full min-h-[44px] cursor-pointer appearance-none py-2.5 pl-3 pr-10 disabled:cursor-not-allowed disabled:opacity-60`;

function SelectChevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function NewRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('reception.newRequest');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const toast = useToast();
  const { data: rooms = [] } = useQuery({
    ...roomsListQueryOptions<RoomOpt>(),
    enabled: open,
  });
  const { data: types = [] } = useQuery({
    queryKey: ['service-request-types'],
    queryFn: () => api<TypeOpt[]>('/service-requests/types'),
    enabled: open,
  });

  const [roomId, setRoomId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [description, setDescription] = useState('');
  const [roomQ, setRoomQ] = useState('');

  useEffect(() => {
    if (!open) return;
    if (!typeId && types.length > 0) {
      setTypeId(types[0].id);
    }
  }, [open, typeId, types]);

  /** Default room when modal opens / rooms load; keep user’s choice across rooms refetches. */
  useEffect(() => {
    if (!open || rooms.length === 0) return;
    setRoomId((prev) => prev || rooms[0].id);
  }, [open, rooms]);

  const filteredRooms = useMemo(() => {
    const q = roomQ.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.roomNumber.toLowerCase().includes(q));
  }, [rooms, roomQ]);

  /**
   * The <select> must always list an <option> for `value={roomId}`.
   * If search narrows the list, the chosen room can be missing → browser shows the first option (e.g. “1”) and submits can mismatch.
   */
  const roomOptions = useMemo(() => {
    const base = filteredRooms.length > 0 ? filteredRooms : rooms;
    if (!roomId) return base;
    if (base.some((r) => r.id === roomId)) return base;
    const chosen = rooms.find((r) => r.id === roomId);
    return chosen ? [chosen, ...base] : base;
  }, [rooms, filteredRooms, roomId]);

  type CreatePayload = {
    roomId: string;
    typeId: string;
    priority: 'NORMAL' | 'URGENT';
    description?: string;
  };

  const create = useMutation({
    mutationFn: (payload: CreatePayload) =>
      api('/service-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      setDescription('');
      setRoomId('');
      setTypeId(types[0]?.id ?? '');
      setPriority('NORMAL');
      setRoomQ('');
      toast.push(t('created'), 'success');
      onClose();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t('createFailed');
      toast.push(msg, 'warning');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roomId) {
      toast.push(t('chooseRoomContinue'), 'warning');
      return;
    }
    if (!typeId) {
      toast.push(t('chooseType'), 'warning');
      return;
    }
    create.mutate({
      roomId,
      typeId,
      priority,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  }

  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({ open, onClose, containerRef: panelRef });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={panelRef}
        className={`${APP_DARK_CARD} w-full max-w-lg shadow-lift`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-req-title"
      >
        <div className="border-b border-sidebar-border/60 px-6 py-4">
          <h2 id="new-req-title" className="text-lg font-semibold text-white">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-sidebar-muted">{t('subtitle')}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <div>
            <label className="text-sm font-medium text-white">{t('room')}</label>
            <input
              type="search"
              className={fieldClass}
              placeholder={t('searchRoom')}
              value={roomQ}
              onChange={(e) => setRoomQ(e.target.value)}
            />
            <div className="relative mt-2">
              <select
                className={selectFieldClass}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
                disabled={rooms.length === 0}
              >
                {rooms.length === 0 ? (
                  <option value="">{t('noRooms')}</option>
                ) : (
                  roomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roomNumber}
                    </option>
                  ))
                )}
              </select>
              <SelectChevron />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-white">{t('requestType')}</label>
            <div className="relative">
              <select
                className={selectFieldClass}
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                required
                disabled={types.length === 0}
              >
                {types.length === 0 ? (
                  <option value="">{t('noRequestTypes')}</option>
                ) : (
                  types.map((typeOpt) => (
                    <option key={typeOpt.id} value={typeOpt.id}>
                      {typeOpt.label}
                    </option>
                  ))
                )}
              </select>
              <SelectChevron />
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-white">{t('priority')}</span>
            <div className="mt-2 flex gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
                <input
                  type="radio"
                  name="prio"
                  checked={priority === 'NORMAL'}
                  onChange={() => setPriority('NORMAL')}
                  className="text-action"
                />
                {t('normal')}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
                <input
                  type="radio"
                  name="prio"
                  checked={priority === 'URGENT'}
                  onChange={() => setPriority('URGENT')}
                  className="text-danger"
                />
                {t('urgent')}
              </label>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-white">{t('notesOptional')}</label>
            <textarea
              className={`${fieldClass} min-h-[80px] resize-y`}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              variant="action"
              className="min-h-[48px] min-w-[140px]"
              disabled={create.isPending || !roomId || !typeId}
            >
              {create.isPending ? t('creating') : t('create')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[48px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
              onClick={onClose}
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
