'use client';

import { useState } from 'react';
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

const SOURCE_LABEL: Record<NonNullable<LastCleaningDto>['source'], string> = {
  inspection_photo: 'Inspection photo',
  housekeeper_declared: 'Marked clean by housekeeper',
  cleaning_session: 'Cleaning session',
  inspection: 'Passed inspection',
};

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
  const [timelineOpen, setTimelineOpen] = useState(false);
  const dark = tone === 'dark';

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
          Last cleaning
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
              {SOURCE_LABEL[lastCleaning.source]}
            </p>
          </div>
        ) : (
          <p className={dark ? 'text-sm text-sidebar-muted' : 'text-sm text-ink-muted'}>
            No cleaning or inspection activity on record yet.
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
          Latest inspection photo
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
            <img src={lastCleaningPhoto.url} alt={`Room ${roomNumber} inspection`} className="aspect-video w-full object-cover" />
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
            Photo is stored but could not be loaded (check S3 configuration).
          </p>
        ) : (
          <p className={dark ? 'text-sm text-sidebar-muted' : 'text-sm text-ink-muted'}>No inspection photos yet.</p>
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
          Photo timeline
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
          Maintenance &amp; housekeeping notes
        </h3>
        <div
          className={
            dark
              ? 'rounded-btn border border-sidebar-border/60 bg-sidebar px-3 py-2 text-sm'
              : 'rounded-btn border border-border bg-surface-muted/40 px-3 py-2 text-sm'
          }
        >
          <p>
            <span className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>Out of order: </span>
            <span className={dark ? 'font-medium text-white' : 'font-medium text-ink'}>
              {outOfOrder ? 'Yes' : 'No'}
            </span>
          </p>
          {(oooReason || outOfOrder) && (
            <p className={dark ? 'mt-2 text-white' : 'mt-2 text-ink'}>
              <span className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>Reason: </span>
              {oooReason || '—'}
            </p>
          )}
          {oooUntil && (
            <p className={dark ? 'mt-1 text-white' : 'mt-1 text-ink'}>
              <span className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>OOO until: </span>
              {formatWhen(oooUntil)}
            </p>
          )}
          {!maintenanceReadOnly && (
            <p className={dark ? 'mt-2 text-xs text-sidebar-muted' : 'mt-2 text-xs text-ink-muted'}>
              Use the maintenance fields below to update reason and expected return.
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
