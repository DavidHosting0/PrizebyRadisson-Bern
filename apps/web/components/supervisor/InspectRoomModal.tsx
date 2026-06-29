'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import { FormEvent, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  roomNumber: string;
};

async function uploadInspectionPhoto(roomId: string, file: File, roomInspectionId: string) {
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
      roomInspectionId,
    }),
  });
}

export function InspectRoomModal({ open, onClose, roomId, roomNumber }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const result = await api<{ inspection: { id: string } }>('/inspections', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          passed,
          notes: notes.trim() || undefined,
        }),
      });
      if (photoFile) {
        await uploadInspectionPhoto(roomId, photoFile, result.inspection.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['room', roomId] });
      qc.invalidateQueries({ queryKey: ['room-photos', roomId] });
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
    submit.mutate();
  }

  function onPhotoSelected(file: File | undefined) {
    if (!file) return;
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
  }

  if (!open) return null;

  const field =
    'mt-1.5 w-full rounded-btn border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-card border border-border bg-surface shadow-lift sm:rounded-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Inspect room</h2>
          <p className="mt-1 text-sm text-ink-muted">Room {roomNumber}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div>
            <p className="text-sm font-medium text-ink">Inspection photo</p>
            <p className="mt-1 text-xs text-ink-muted">Take a photo of the room during inspection.</p>
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
              <div className="mt-3 overflow-hidden rounded-btn border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Inspection preview" className="aspect-video w-full object-cover" />
                <div className="flex gap-2 border-t border-border p-2">
                  <Button type="button" variant="secondary" className="min-h-[40px] flex-1" onClick={() => fileRef.current?.click()}>
                    Retake
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-[40px]"
                    onClick={() => {
                      setPhotoFile(null);
                      if (photoPreview) URL.revokeObjectURL(photoPreview);
                      setPhotoPreview(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="mt-3 min-h-[48px] w-full"
                onClick={() => fileRef.current?.click()}
              >
                Take inspection photo
              </Button>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-action focus:ring-action/30"
              checked={passed}
              onChange={(e) => setPassed(e.target.checked)}
            />
            Passed inspection
          </label>
          <div>
            <label className="text-sm font-medium text-ink">Notes (optional)</label>
            <textarea
              className={`${field} min-h-[80px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Issues, praise, follow-up…"
              rows={3}
            />
          </div>
          {submit.isError && (
            <p className="text-sm text-danger">{submit.error instanceof Error ? submit.error.message : 'Failed'}</p>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" variant="action" className="min-h-[48px]" disabled={submit.isPending}>
              {submit.isPending ? 'Saving…' : 'Save inspection'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
