'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

export type TimelinePhoto = {
  id: string;
  url: string | null;
  mime: string | null;
  takenAt: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string };
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

export function RoomPhotoTimelineModal({ roomId, roomNumber, open, onClose }: Props) {
  const [lightbox, setLightbox] = useState<TimelinePhoto | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['room-photos', roomId],
    queryFn: () => api<TimelinePhoto[]>(`/rooms/${roomId}/photos`),
    enabled: open && !!roomId,
  });

  if (!open || !roomId) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-[60] bg-ink/40" aria-label="Close" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[70] max-h-[85vh] w-[min(100vw-1.5rem,720px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Photo timeline</h2>
            {roomNumber && <p className="text-xs text-ink-muted">Room {roomNumber}</p>}
          </div>
          <Button type="button" variant="secondary" className="min-h-[40px]" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="max-h-[calc(85vh-56px)] overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-ink-muted">Loading photos…</p>}
          {!isLoading && photos.length === 0 && (
            <p className="text-sm text-ink-muted">No cleaning photos yet for this room.</p>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full overflow-hidden rounded-lg border border-border bg-surface-muted text-left transition hover:border-action/50"
                  onClick={() => p.url && setLightbox(p)}
                  disabled={!p.url}
                >
                  <div className="relative aspect-[4/3] bg-surface-muted">
                    {p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center p-2 text-center text-xs text-ink-muted">
                        Preview unavailable (storage)
                      </div>
                    )}
                  </div>
                  <div className="p-2 text-[11px] text-ink-muted">
                    <p className="font-medium text-ink">{p.uploadedBy.name}</p>
                    <p>{formatWhen(p.takenAt ?? p.createdAt, '—')}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
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
              {lightbox.uploadedBy.name} · {formatWhen(lightbox.takenAt ?? lightbox.createdAt, '')}
            </p>
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
