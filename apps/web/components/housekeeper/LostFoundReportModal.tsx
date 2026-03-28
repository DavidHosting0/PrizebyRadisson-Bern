'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  roomNumber: string;
};

export function LostFoundReportModal({ open, onClose, roomId, roomNumber }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [articleName, setArticleName] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const name = articleName.trim();
      if (!name) throw new Error('Article name is required');
      const description = notes.trim() ? `${name}\n\n${notes.trim()}` : name;

      let photoS3Key: string | null = null;
      if (file) {
        const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1600 });
        const presign = await api<{ uploadUrl: string; key: string }>('/lost-found/presign', {
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
        photoS3Key = presign.key;
      }

      await api('/lost-found', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          description,
          photoS3Key,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lost-found'] });
      setArticleName('');
      setNotes('');
      setFile(null);
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  if (!open) return null;

  const field =
    'mt-1.5 w-full rounded-btn border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-card border border-border bg-surface shadow-lift sm:rounded-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Report lost &amp; found</h2>
          <p className="mt-1 text-sm text-ink-muted">Room {roomNumber}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div>
            <label className="text-sm font-medium text-ink">Article / item name *</label>
            <input
              className={field}
              value={articleName}
              onChange={(e) => setArticleName(e.target.value)}
              placeholder="e.g. Blue scarf"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Description (optional)</label>
            <textarea
              className={`${field} min-h-[72px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Where found, condition…"
              rows={3}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Photo (optional)</label>
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
              <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => fileRef.current?.click()}>
                {file ? 'Change photo' : 'Add photo'}
              </Button>
              {file && (
                <span className="text-xs text-ink-muted">{file.name}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" variant="action" className="min-h-[48px]" disabled={submit.isPending}>
              {submit.isPending ? 'Submitting…' : 'Submit report'}
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
