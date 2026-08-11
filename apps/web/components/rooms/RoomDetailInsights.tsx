'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { Button } from '@/components/ui/Button';
import { RoomPhotoTimelineModal } from '@/components/rooms/RoomPhotoTimelineModal';

export type LastCleaningPhotoDto = {
  id: string;
  url: string | null;
  takenAt: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string; titlePrefix: string };
} | null;

export type LastCleaningDto = {
  by: { id: string; name: string; titlePrefix: string };
  at: string;
  source: 'inspection_photo' | 'housekeeper_declared' | 'cleaning_session' | 'inspection';
} | null;

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

type Props = {
  roomId: string;
  roomNumber: string;
  lastCleaningPhoto: LastCleaningPhotoDto;
  lastCleaning: LastCleaningDto;
  outOfOrder: boolean;
  oooReason: string | null;
  oooUntil: string | null;
  /** Supervisor can edit maintenance fields in RoomSlideOver; reception is read-only here. */
  maintenanceReadOnly?: boolean;
  tone?: 'light' | 'dark';
};

export function RoomDetailInsights({
  roomId,
  roomNumber,
  lastCleaningPhoto,
  lastCleaning,
  outOfOrder,
  oooReason,
  oooUntil,
  maintenanceReadOnly = true,
  tone = 'light',
}: Props) {
  const t = useTranslations('room.insights');
  const tCommon = useTranslations('common');
  const [timelineOpen, setTimelineOpen] = useState(false);
  const dark = tone === 'dark';

  const sourceLabel = (source: NonNullable<LastCleaningDto>['source']) => {
    switch (source) {
      case 'inspection_photo':
        return t('sourceInspectionPhoto');
      case 'housekeeper_declared':
        return t('sourceHousekeeperDeclared');
      case 'cleaning_session':
        return t('sourceCleaningSession');
      case 'inspection':
        return t('sourceInspection');
    }
  };

  return (
    <>
      <section className="space-y-4">
        <h3
          className={
            dark
              ? 'text-xs font-semibold uppercase tracking-wider text-sidebar-muted'
              : 'text-xs font-semibold uppercase tracking-wider text-ink-muted'
          }
        >
          {t('lastCleaning')}
        </h3>
        {lastCleaning ? (
          <div
            className={
              dark
                ? 'rounded-btn border border-sidebar-border/60 bg-sidebar px-3 py-2 text-sm'
                : 'rounded-btn border border-border bg-surface-muted/50 px-3 py-2 text-sm'
            }
          >
            <p className={dark ? 'font-medium text-white' : 'font-medium text-ink'}>
              {formatUserWithTitlePrefix(lastCleaning.by.name, lastCleaning.by.titlePrefix)}
            </p>
            <p className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>{formatWhen(lastCleaning.at)}</p>
            <p className={dark ? 'mt-1 text-xs text-sidebar-muted' : 'mt-1 text-xs text-ink-muted'}>
              {sourceLabel(lastCleaning.source)}
            </p>
          </div>
        ) : (
          <p className={dark ? 'text-sm text-sidebar-muted' : 'text-sm text-ink-muted'}>
            {t('noCleaningActivity')}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3
          className={
            dark
              ? 'text-xs font-semibold uppercase tracking-wider text-sidebar-muted'
              : 'text-xs font-semibold uppercase tracking-wider text-ink-muted'
          }
        >
          {t('latestInspectionPhoto')}
        </h3>
        {lastCleaningPhoto?.url ? (
          <button
            type="button"
            className={
              dark
                ? 'block w-full overflow-hidden rounded-btn border border-sidebar-border/60 text-left transition hover:border-action/50'
                : 'block w-full overflow-hidden rounded-btn border border-border text-left transition hover:border-action/50'
            }
            onClick={() => setTimelineOpen(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lastCleaningPhoto.url}
              alt={t('inspectionPhotoAlt', { roomNumber })}
              className="aspect-video w-full object-cover"
            />
            <p className={dark ? 'px-2 py-1.5 text-xs text-sidebar-muted' : 'px-2 py-1.5 text-xs text-ink-muted'}>
              {formatUserWithTitlePrefix(
                lastCleaningPhoto.uploadedBy.name,
                lastCleaningPhoto.uploadedBy.titlePrefix,
              )}{' '}
              · {formatWhen(lastCleaningPhoto.takenAt ?? lastCleaningPhoto.createdAt)}
            </p>
          </button>
        ) : lastCleaningPhoto && !lastCleaningPhoto.url ? (
          <p className={dark ? 'text-sm text-sidebar-muted' : 'text-sm text-ink-muted'}>
            {t('photoStoredNotLoaded')}
          </p>
        ) : (
          <p className={dark ? 'text-sm text-sidebar-muted' : 'text-sm text-ink-muted'}>{t('noInspectionPhotos')}</p>
        )}
        <Button
          type="button"
          variant="secondary"
          className={
            dark
              ? 'w-full min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10'
              : 'w-full min-h-[44px]'
          }
          onClick={() => setTimelineOpen(true)}
        >
          {t('photoTimeline')}
        </Button>
      </section>

      <section className="space-y-2">
        <h3
          className={
            dark
              ? 'text-xs font-semibold uppercase tracking-wider text-sidebar-muted'
              : 'text-xs font-semibold uppercase tracking-wider text-ink-muted'
          }
        >
          {t('maintenanceNotes')}
        </h3>
        <div
          className={
            dark
              ? 'rounded-btn border border-sidebar-border/60 bg-sidebar px-3 py-2 text-sm'
              : 'rounded-btn border border-border bg-surface-muted/40 px-3 py-2 text-sm'
          }
        >
          <p>
            <span className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>{t('outOfOrderLabel')} </span>
            <span className={dark ? 'font-medium text-white' : 'font-medium text-ink'}>
              {outOfOrder ? tCommon('yes') : tCommon('no')}
            </span>
          </p>
          {(oooReason || outOfOrder) && (
            <p className={dark ? 'mt-2 text-white' : 'mt-2 text-ink'}>
              <span className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>{t('reasonLabel')} </span>
              {oooReason || '—'}
            </p>
          )}
          {oooUntil && (
            <p className={dark ? 'mt-1 text-white' : 'mt-1 text-ink'}>
              <span className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>{t('oooUntilLabel')} </span>
              {formatWhen(oooUntil)}
            </p>
          )}
          {!maintenanceReadOnly && (
            <p className={dark ? 'mt-2 text-xs text-sidebar-muted' : 'mt-2 text-xs text-ink-muted'}>
              {t('maintenanceEditHint')}
            </p>
          )}
        </div>
      </section>

      <RoomPhotoTimelineModal
        roomId={roomId}
        roomNumber={roomNumber}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />
    </>
  );
}
