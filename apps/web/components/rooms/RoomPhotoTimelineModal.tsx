'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { Button } from '@/components/ui/Button';

export type TimelinePhoto = {
  id: string;
  url: string | null;
  mime: string | null;
  takenAt: string | null;
  createdAt: string;
  roomInspectionId: string | null;
  inspection: {
    id: string;
    passed: boolean;
    notes: string | null;
    inspectedAt: string;
  } | null;
  uploadedBy: { id: string; name: string; titlePrefix: string };
};

type Props = {
  roomId: string | null;
  roomNumber?: string;
  open: boolean;
  onClose: () => void;
};

function formatWhen(iso: string | null | undefined, fallback: string) {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return fallback;
  }
}

function formatDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'long',
      dateStyle: 'long',
    });
  } catch {
    return iso;
  }
}

export function RoomPhotoTimelineModal({ roomId, roomNumber, open, onClose }: Props) {
  const [lightbox, setLightbox] = useState<TimelinePhoto | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['room-photos', roomId],
    queryFn: () => api<TimelinePhoto[]>(`/rooms/${roomId}/photos`),
    enabled: open && !!roomId,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TimelinePhoto[]>();
    for (const photo of photos) {
      const key = (photo.takenAt ?? photo.createdAt).slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(photo);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [photos]);

  if (!open || !roomId) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-[60] bg-ink/40" aria-label="Close" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[70] max-h-[85vh] w-[min(100vw-1.5rem,720px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Inspection photo timeline</h2>
            {roomNumber && <p className="text-xs text-ink-muted">Room {roomNumber}</p>}
          </div>
          <Button type="button" variant="secondary" className="min-h-[40px]" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="max-h-[calc(85vh-56px)] overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-ink-muted">Loading photos…</p>}
          {!isLoading && photos.length === 0 && (
            <p className="text-sm text-ink-muted">No inspection photos yet for this room.</p>
          )}
          <div className="space-y-6">
            {grouped.map(([day, dayPhotos]) => (
              <section key={day}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  {formatDay(dayPhotos[0]?.takenAt ?? dayPhotos[0]?.createdAt ?? day)}
                </h3>
                <ul className="mt-3 space-y-3">
                  {dayPhotos.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full gap-3 overflow-hidden rounded-lg border border-border bg-surface-muted text-left transition hover:border-action/50"
                        onClick={() => p.url && setLightbox(p)}
                        disabled={!p.url}
                      >
                        <div className="relative h-24 w-32 shrink-0 bg-surface-muted sm:h-28 sm:w-40">
                          {p.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center p-2 text-center text-xs text-ink-muted">
                              Preview unavailable
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 py-3 pr-3">
                          <p className="text-sm font-medium text-ink">
                            {formatUserWithTitlePrefix(p.uploadedBy.name, p.uploadedBy.titlePrefix)}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {formatWhen(p.takenAt ?? p.createdAt, '—')}
                          </p>
                          <p className="mt-2 text-xs font-medium text-ink-muted">
                            {p.inspection
                              ? p.inspection.passed
                                ? 'Passed inspection'
                                : 'Failed inspection'
                              : 'Legacy photo'}
                          </p>
                          {p.inspection?.notes && (
                            <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{p.inspection.notes}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      {lightbox?.url && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[80] bg-black/70"
            aria-label="Close preview"
            onClick={() => setLightbox(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-[90] w-[min(96vw,900px)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black p-2 shadow-lift">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.url} alt="" className="max-h-[80vh] w-full object-contain" />
            <p className="mt-2 text-center text-sm text-white/90">
              {formatUserWithTitlePrefix(lightbox.uploadedBy.name, lightbox.uploadedBy.titlePrefix)} ·{' '}
              {formatWhen(lightbox.takenAt ?? lightbox.createdAt, '')}
            </p>
            {lightbox.inspection?.notes && (
              <p className="mt-1 text-center text-sm text-white/75">{lightbox.inspection.notes}</p>
            )}
            <div className="mt-2 flex justify-center">
              <Button type="button" variant="secondary" onClick={() => setLightbox(null)}>
                Close preview
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
