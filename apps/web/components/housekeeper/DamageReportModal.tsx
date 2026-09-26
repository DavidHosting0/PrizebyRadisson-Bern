'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { useDamageTypeOptions } from '@/lib/damageReportTypes';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/toast/ToastProvider';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';

type RoomOpt = { id: string; roomNumber: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fixed room (housekeeper / inspect flows). Omit when `pickRoom`. */
  roomId?: string;
  roomNumber?: string;
  /** Show room search + select (chat / reception). */
  pickRoom?: boolean;
};

const darkSecondaryBtn =
  'min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10';

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

export function DamageReportModal({ open, onClose, roomId: fixedRoomId, roomNumber: fixedRoomNumber, pickRoom }: Props) {
  const t = useTranslations('housekeeper');
  const tReq = useTranslations('reception.newRequest');
  const tToast = useTranslations('toast');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const toast = useToast();
  const damageTypeOptions = useDamageTypeOptions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [damageType, setDamageType] = useState<string>('FURNITURE');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pickedRoomId, setPickedRoomId] = useState('');
  const [roomQ, setRoomQ] = useState('');

  const { data: rooms = [] } = useQuery({
    ...roomsListQueryOptions<RoomOpt>(),
    enabled: open && !!pickRoom,
  });

  useEffect(() => {
    if (!open || !pickRoom || rooms.length === 0) return;
    setPickedRoomId((prev) => prev || rooms[0].id);
  }, [open, pickRoom, rooms]);

  const filteredRooms = useMemo(() => {
    const q = roomQ.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.roomNumber.toLowerCase().includes(q));
  }, [rooms, roomQ]);

  const roomOptions = useMemo(() => {
    const base = filteredRooms.length > 0 ? filteredRooms : rooms;
    if (!pickedRoomId) return base;
    if (base.some((r) => r.id === pickedRoomId)) return base;
    const chosen = rooms.find((r) => r.id === pickedRoomId);
    return chosen ? [chosen, ...base] : base;
  }, [rooms, filteredRooms, pickedRoomId]);

  const roomId = pickRoom ? pickedRoomId : (fixedRoomId ?? '');
  const roomNumber =
    pickRoom
      ? (rooms.find((r) => r.id === pickedRoomId)?.roomNumber ?? '')
      : (fixedRoomNumber ?? '');

  const submit = useMutation({
    mutationFn: async () => {
      if (!roomId) throw new Error(tReq('chooseRoomContinue'));
      const desc = description.trim();
      if (!desc) throw new Error(t('descriptionRequired'));
      if (!file) throw new Error(t('photoRequired'));

      const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1600 });
      const presign = await api<{ uploadUrl: string; key: string }>('/damage-reports/presign', {
        method: 'POST',
        body: JSON.stringify({
          contentType: compressed.type || 'image/jpeg',
          roomId,
        }),
      });
      await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: compressed,
        headers: { 'Content-Type': compressed.type || 'image/jpeg' },
      });

      await api('/damage-reports', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          damageType,
          description: desc,
          photoS3Key: presign.key,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['damage-reports'] });
      setDamageType('FURNITURE');
      setDescription('');
      setFile(null);
      setRoomQ('');
      if (pickRoom) setPickedRoomId('');
      toast.push(t('reportCreated'), 'success');
      onClose();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : tToast('error');
      toast.push(msg, 'warning');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({ open, onClose, containerRef: panelRef });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="damage-report-title"
        className={clsx(
          APP_DARK_CARD,
          'flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-card shadow-lift sm:rounded-card',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sidebar-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 id="damage-report-title" className="text-lg font-semibold tracking-tight text-white">
              {pickRoom ? t('maintenanceTitle') : t('damageTitle')}
            </h2>
            {!pickRoom && roomNumber ? (
              <p className="mt-1 text-sm text-sidebar-muted">{t('room', { number: roomNumber })}</p>
            ) : (
              <p className="mt-1 text-sm text-sidebar-muted">{t('maintenanceSubtitle')}</p>
            )}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-sidebar-muted transition hover:bg-white/10 hover:text-white"
            aria-label={tCommon('close')}
            onClick={onClose}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit} className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="space-y-4 p-5">
            {pickRoom && (
              <div>
                <label className="text-sm font-medium text-white">{tReq('room')}</label>
                <input
                  type="search"
                  className={clsx(APP_DARK_INPUT, 'mt-1.5 w-full min-h-[44px] px-3 py-2')}
                  placeholder={tReq('searchRoom')}
                  value={roomQ}
                  onChange={(e) => setRoomQ(e.target.value)}
                />
                <div className="relative mt-2">
                  <select
                    className={selectFieldClass}
                    value={pickedRoomId}
                    onChange={(e) => setPickedRoomId(e.target.value)}
                    required
                    disabled={rooms.length === 0}
                  >
                    {rooms.length === 0 ? (
                      <option value="">{tReq('noRooms')}</option>
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
            )}
            <div>
              <label className="text-sm font-medium text-white">{t('damageType')}</label>
              <select
                className={clsx(APP_DARK_INPUT, 'mt-1.5 w-full min-h-[44px] py-2.5')}
                value={damageType}
                onChange={(e) => setDamageType(e.target.value)}
                required
              >
                {damageTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-white">{t('descriptionRequired')}</label>
              <textarea
                className={clsx(APP_DARK_INPUT, 'mt-1.5 min-h-[88px] w-full resize-y py-2.5')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                rows={4}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white">{t('photoRequired')}</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className={darkSecondaryBtn}
                  onClick={() => fileRef.current?.click()}
                >
                  {file ? t('changePhoto') : t('takeOrChoosePhoto')}
                </Button>
                {file && <span className="text-xs text-sidebar-muted">{file.name}</span>}
              </div>
              {!file && <p className="mt-1 text-xs text-sidebar-muted">{t('photoRequiredHint')}</p>}
            </div>
            {submit.isError && (
              <p className="text-sm text-danger">
                {submit.error instanceof Error ? submit.error.message : tToast('error')}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-3 border-t border-sidebar-border/60 bg-sidebar-hover/30 px-5 py-4">
            <Button type="submit" variant="action" className="min-h-[48px] min-w-[140px]" disabled={submit.isPending}>
              {submit.isPending ? t('submitting') : t('submitReport')}
            </Button>
            <Button type="button" variant="secondary" className={darkSecondaryBtn} onClick={onClose}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
