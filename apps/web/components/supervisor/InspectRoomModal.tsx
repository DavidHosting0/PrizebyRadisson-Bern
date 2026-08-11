'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import clsx from 'clsx';
import { FormEvent, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useDamageTypeLabel } from '@/lib/damageReportTypes';
import { usePermission } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { DamageReportModal } from '@/components/housekeeper/DamageReportModal';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';

type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  roomNumber: string;
};

type DamageRow = {
  id: string;
  damageType: string;
  description: string;
  status: string;
  photoUrl: string;
};

const DAMAGE_STATUS_KEYS: Record<string, 'reported' | 'acknowledged' | 'resolved'> = {
  REPORTED: 'reported',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
};

const darkSecondaryBtn =
  'min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10';

async function uploadInspectionPhoto(roomId: string, file: File): Promise<string> {
  const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1600 });
  const contentType = compressed.type?.trim() ? compressed.type : 'image/jpeg';
  const presign = await api<{ uploadUrl: string; photoId: string }>(`/rooms/${roomId}/photos/presign`, {
    method: 'POST',
    body: JSON.stringify({ contentType }),
  });
  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    body: compressed,
    headers: { 'Content-Type': contentType },
  });
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '');
    throw new Error(t || `Upload failed (${putRes.status})`);
  }
  await api(`/rooms/${roomId}/photos/complete`, {
    method: 'POST',
    body: JSON.stringify({
      photoId: presign.photoId,
      mime: contentType,
      bytes: Math.max(0, Math.round(compressed.size)),
    }),
  });
  return presign.photoId;
}

export function InspectRoomModal({ open, onClose, roomId, roomNumber }: Props) {
  const qc = useQueryClient();
  const t = useTranslations('supervisor.inspectModal');
  const tHk = useTranslations('housekeeper');
  const tChat = useTranslations('chat');
  const tCommon = useTranslations('common');
  const damageLabel = useDamageTypeLabel();
  const canReportDamage = usePermission('DAMAGE_REPORT_CREATE');
  const canReadDamage = usePermission('DAMAGE_REPORT_READ');
  const fileRef = useRef<HTMLInputElement>(null);
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [damageOpen, setDamageOpen] = useState(false);

  const damageStatusLabel = (status: string) => {
    const key = DAMAGE_STATUS_KEYS[status];
    return key ? tChat(`damageStatus.${key}`) : status.replace(/_/g, ' ');
  };

  const damagesQ = useQuery({
    queryKey: ['damage-reports', 'room', roomId],
    queryFn: () => api<DamageRow[]>(`/damage-reports?roomId=${encodeURIComponent(roomId)}`),
    enabled: open && canReadDamage,
  });

  const openDamages = (damagesQ.data ?? []).filter((d) => d.status !== 'RESOLVED');

  const submit = useMutation({
    mutationFn: async () => {
      if (!photoFile) throw new Error(t('photoRequiredError'));
      const photoId = await uploadInspectionPhoto(roomId, photoFile);
      await api<{ inspection: { id: string } }>('/inspections', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          passed,
          notes: notes.trim() || undefined,
          photoId,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      qc.invalidateQueries({ queryKey: ['room-photos', roomId] });
      qc.invalidateQueries({ queryKey: ['assignments', 'my-inspection-tasks'] });
      qc.invalidateQueries({ queryKey: ['damage-reports'] });
      setNotes('');
      setPassed(true);
      setPhotoFile(null);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!photoFile) return;
    submit.mutate();
  }

  function onPhotoSelected(file: File | undefined) {
    if (!file) return;
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
  }

  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({ open: open && !damageOpen, onClose, containerRef: panelRef });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-room-title"
        className={clsx(
          APP_DARK_CARD,
          'flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-card shadow-lift sm:rounded-card',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sidebar-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 id="inspect-room-title" className="text-lg font-semibold tracking-tight text-white">
              {t('title')}
            </h2>
            <p className="mt-1 text-sm text-sidebar-muted">{tHk('room', { number: roomNumber })}</p>
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

        <form
          onSubmit={onSubmit}
          className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="space-y-4 p-5">
            {canReadDamage && (
              <section className="rounded-xl border border-sidebar-border/60 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-white">{t('knownDamage')}</p>
                <p className="mt-1 text-xs text-sidebar-muted">{t('knownDamageHint')}</p>
                {damagesQ.isLoading && (
                  <p className="mt-2 text-xs text-sidebar-muted">{tCommon('loading')}</p>
                )}
                {!damagesQ.isLoading && openDamages.length === 0 && (
                  <p className="mt-2 text-xs text-sidebar-muted">{t('noOpenDamage')}</p>
                )}
                {openDamages.length > 0 && (
                  <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                    {openDamages.map((d) => (
                      <li
                        key={d.id}
                        className="flex gap-2 rounded-btn border border-sidebar-border/60 bg-sidebar/60 p-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={d.photoUrl}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100">
                            {damageLabel(d.damageType)}
                          </p>
                          <p className="line-clamp-2 text-xs text-sidebar-muted">{d.description}</p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-sidebar-muted">
                            {damageStatusLabel(d.status)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {canReportDamage && (
                  <Button
                    type="button"
                    variant="secondary"
                    className={clsx(darkSecondaryBtn, 'mt-3 w-full')}
                    onClick={() => setDamageOpen(true)}
                  >
                    {tHk('reportDamage')}
                  </Button>
                )}
              </section>
            )}

            <div>
              <p className="text-sm font-medium text-white">
                {t('inspectionPhoto')} <span className="text-danger">*</span>
              </p>
              <p className="mt-1 text-xs text-sidebar-muted">{t('photoRequiredHint')}</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  onPhotoSelected(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {photoPreview ? (
                <div className="mt-3 overflow-hidden rounded-btn border border-sidebar-border/60 bg-sidebar/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt={t('photoPreviewAlt')}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="flex gap-2 border-t border-sidebar-border/60 p-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className={clsx(darkSecondaryBtn, 'flex-1')}
                      onClick={() => fileRef.current?.click()}
                    >
                      {t('retake')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-[44px] text-sidebar-muted hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setPhotoFile(null);
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhotoPreview(null);
                      }}
                    >
                      {t('remove')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className={clsx(darkSecondaryBtn, 'mt-3 min-h-[48px] w-full')}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('takePhoto')}
                </Button>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-white">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-sidebar-border bg-sidebar text-action focus:ring-action/30"
                checked={passed}
                onChange={(e) => setPassed(e.target.checked)}
              />
              {t('passedInspection')}
            </label>

            <div>
              <label className="text-sm font-medium text-white">{tHk('notesOptional')}</label>
              <textarea
                className={clsx(APP_DARK_INPUT, 'mt-1.5 min-h-[80px] w-full resize-y py-2.5')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
                rows={3}
              />
            </div>

            {submit.isError && (
              <p className="text-sm text-danger">
                {submit.error instanceof Error ? submit.error.message : tCommon('error')}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-3 border-t border-sidebar-border/60 bg-sidebar-hover/30 px-5 py-4">
            <Button
              type="submit"
              variant="action"
              className="min-h-[48px] min-w-[140px]"
              disabled={submit.isPending || !photoFile}
            >
              {submit.isPending ? tHk('saving') : t('saveInspection')}
            </Button>
            <Button type="button" variant="secondary" className={darkSecondaryBtn} onClick={onClose}>
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      </div>

      <DamageReportModal
        open={damageOpen}
        onClose={() => {
          setDamageOpen(false);
          qc.invalidateQueries({ queryKey: ['damage-reports', 'room', roomId] });
        }}
        roomId={roomId}
        roomNumber={roomNumber}
      />
    </div>
  );
}
