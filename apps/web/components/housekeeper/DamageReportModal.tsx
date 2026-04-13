'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { api } from '@/lib/api';
import { DAMAGE_TYPE_OPTIONS } from '@/lib/damageReportTypes';
import { Button } from '@/components/ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  roomNumber: string;
};

export function DamageReportModal({ open, onClose, roomId, roomNumber }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [damageType, setDamageType] = useState<string>('FURNITURE');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const desc = description.trim();
      if (!desc) throw new Error('Description is required');
      if (!file) throw new Error('A photo is required');

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
          <h2 className="text-lg font-semibold text-ink">Report damage</h2>
          <p className="mt-1 text-sm text-ink-muted">Room {roomNumber}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div>
            <label className="text-sm font-medium text-ink">Type of damage *</label>
            <select
              className={field}
              value={damageType}
              onChange={(e) => setDamageType(e.target.value)}
              required
            >
              {DAMAGE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Description *</label>
            <textarea
              className={`${field} min-h-[88px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is damaged and where?"
              rows={4}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Photo *</label>
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
                {file ? 'Change photo' : 'Take or choose photo'}
              </Button>
              {file && <span className="text-xs text-ink-muted">{file.name}</span>}
            </div>
            {!file && <p className="mt-1 text-xs text-ink-muted">A picture is required for maintenance.</p>}
          </div>
          {submit.isError && (
            <p className="text-sm text-danger">
              {submit.error instanceof Error ? submit.error.message : 'Something went wrong'}
            </p>
          )}
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
