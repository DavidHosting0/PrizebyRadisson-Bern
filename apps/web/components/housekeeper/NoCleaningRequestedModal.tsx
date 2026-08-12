'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { APP_DARK_CARD } from '@/components/nav/AppPageChrome';

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;
  roomNumber: string;
};

const darkSecondaryBtn =
  'min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10';

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

export function NoCleaningRequestedModal({ open, onClose, taskId, roomNumber }: Props) {
  const t = useTranslations('housekeeper');
  const tToast = useTranslations('toast');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    // Open camera as soon as the sheet appears (mobile capture).
    const id = window.setTimeout(() => fileRef.current?.click(), 80);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t('noCleaningPhotoRequired'));

      const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1600 });
      const contentType = compressed.type || 'image/jpeg';
      const presign = await api<{ uploadUrl: string; key: string }>(
        `/assignments/daily-plan/tasks/${taskId}/presign-evidence`,
        {
          method: 'POST',
          body: JSON.stringify({ contentType }),
        },
      );
      await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: compressed,
        headers: { 'Content-Type': contentType },
      });

      await api(`/assignments/daily-plan/tasks/${taskId}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'NO_CLEANING_REQUESTED',
          photoS3Key: presign.key,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments', 'my-daily-tasks'] });
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({ open, onClose, containerRef: panelRef });

  if (!open) return null;

  const errorMessage =
    submit.error instanceof Error
      ? parseApiError(submit.error.message)
      : submit.isError
        ? tToast('error')
        : null;

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
        aria-labelledby="no-cleaning-title"
        className={clsx(
          APP_DARK_CARD,
          'flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-card shadow-lift sm:rounded-card',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sidebar-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 id="no-cleaning-title" className="text-lg font-semibold tracking-tight text-white">
              {t('noCleaningRequested')}
            </h2>
            <p className="mt-1 text-sm text-sidebar-muted">{t('room', { number: roomNumber })}</p>
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
            <p className="text-sm text-sidebar-muted">{t('noCleaningHint')}</p>
            <div>
              <label className="text-sm font-medium text-white">{t('noCleaningPhotoRequired')}</label>
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
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt=""
                  className="mt-3 max-h-48 w-full rounded-btn object-cover ring-1 ring-sidebar-border/60"
                />
              )}
              {!file && <p className="mt-1 text-xs text-sidebar-muted">{t('noCleaningPhotoHint')}</p>}
            </div>
            {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
          </div>

          <div className="flex shrink-0 flex-wrap gap-3 border-t border-sidebar-border/60 bg-sidebar-hover/30 px-5 py-4">
            <Button
              type="submit"
              variant="action"
              className="min-h-[48px] min-w-[140px]"
              disabled={submit.isPending || !file}
            >
              {submit.isPending ? t('submitting') : t('noCleaningConfirm')}
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
