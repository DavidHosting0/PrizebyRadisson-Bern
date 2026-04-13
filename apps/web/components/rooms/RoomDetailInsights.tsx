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
  source: 'cleaning_photo' | 'cleaning_session' | 'inspection';
} | null;

const SOURCE_LABEL: Record<NonNullable<LastCleaningDto>['source'], string> = {
  cleaning_photo: 'Documented with photo',
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
}: Props) {
  const [timelineOpen, setTimelineOpen] = useState(false);

  return (
    <>
      <section className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Last cleaning</h3>
        {lastCleaning ? (
          <div className="rounded-btn border border-border bg-surface-muted/50 px-3 py-2 text-sm">
            <p className="font-medium text-ink">
              {formatUserWithTitlePrefix(lastCleaning.by.name, lastCleaning.by.titlePrefix)}
            </p>
            <p className="text-ink-muted">{formatWhen(lastCleaning.at)}</p>
            <p className="mt-1 text-xs text-ink-muted">{SOURCE_LABEL[lastCleaning.source]}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No cleaning photo, session, or inspection on record yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Latest cleaning photo</h3>
        {lastCleaningPhoto?.url ? (
          <button
            type="button"
            className="block w-full overflow-hidden rounded-btn border border-border text-left transition hover:border-action/50"
            onClick={() => setTimelineOpen(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lastCleaningPhoto.url} alt={`Room ${roomNumber} after cleaning`} className="aspect-video w-full object-cover" />
            <p className="px-2 py-1.5 text-xs text-ink-muted">
              {formatUserWithTitlePrefix(
                lastCleaningPhoto.uploadedBy.name,
                lastCleaningPhoto.uploadedBy.titlePrefix,
              )}{' '}
              · {formatWhen(lastCleaningPhoto.takenAt ?? lastCleaningPhoto.createdAt)}
            </p>
          </button>
        ) : lastCleaningPhoto && !lastCleaningPhoto.url ? (
          <p className="text-sm text-ink-muted">Photo is stored but could not be loaded (check S3 configuration).</p>
        ) : (
          <p className="text-sm text-ink-muted">No photos yet.</p>
        )}
        <Button type="button" variant="secondary" className="w-full min-h-[44px]" onClick={() => setTimelineOpen(true)}>
          Photo timeline
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Maintenance &amp; housekeeping notes</h3>
        <div className="rounded-btn border border-border bg-surface-muted/40 px-3 py-2 text-sm">
          <p>
            <span className="text-ink-muted">Out of order: </span>
            <span className="font-medium text-ink">{outOfOrder ? 'Yes' : 'No'}</span>
          </p>
          {(oooReason || outOfOrder) && (
            <p className="mt-2 text-ink">
              <span className="text-ink-muted">Reason: </span>
              {oooReason || '—'}
            </p>
          )}
          {oooUntil && (
            <p className="mt-1 text-ink">
              <span className="text-ink-muted">OOO until: </span>
              {formatWhen(oooUntil)}
            </p>
          )}
          {!maintenanceReadOnly && (
            <p className="mt-2 text-xs text-ink-muted">Use the maintenance fields below to update reason and expected return.</p>
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
