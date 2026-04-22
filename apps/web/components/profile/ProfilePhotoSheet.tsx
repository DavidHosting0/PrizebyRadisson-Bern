'use client';

import { FormEvent, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { userTitlePrefixLabel } from '@/lib/userTitlePrefix';

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * WhatsApp-style profile sheet: shows current avatar + name/role, lets the
 * user upload a new photo or remove the existing one. Works for every role
 * because it targets /users/me/* endpoints.
 */
export function ProfilePhotoSheet({ open, onClose }: Props) {
  const { user, refreshMe } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!file) throw new Error('Pick a photo first');
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.4,
        maxWidthOrHeight: 720,
      });
      const mime = compressed.type?.trim() ? compressed.type : 'image/jpeg';
      const presign = await api<{ uploadUrl: string; key: string }>('/users/me/avatar/presign', {
        method: 'POST',
        body: JSON.stringify({ contentType: mime }),
      });
      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: compressed,
        headers: { 'Content-Type': mime },
      });
      if (!putRes.ok) throw new Error('Photo upload failed');
      await api('/users/me/avatar', {
        method: 'PATCH',
        body: JSON.stringify({ key: presign.key }),
      });
    },
    onSuccess: async () => {
      setFile(null);
      setPreviewUrl(null);
      await refreshMe();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not update photo');
    },
  });

  const clear = useMutation({
    mutationFn: async () => {
      await api('/users/me/avatar', { method: 'DELETE' });
    },
    onSuccess: async () => {
      setFile(null);
      setPreviewUrl(null);
      await refreshMe();
    },
  });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    upload.mutate();
  }

  function close() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    onClose();
  }

  if (!open || !user) return null;
  const displayUrl = previewUrl ?? user.avatarUrl ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-card border border-border bg-surface shadow-lift sm:rounded-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Your profile</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-surface-muted"
          >
            Close
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar name={user.name} url={displayUrl} size={120} ring />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface shadow-card transition hover:bg-surface-muted"
                aria-label="Change photo"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 7h3l2-2h6l2 2h3v12H4V7z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-ink">{user.name}</p>
              <p className="text-xs text-ink-muted">
                {user.titlePrefix ? `${userTitlePrefixLabel(user.titlePrefix)} · ` : ''}
                {user.email}
              </p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={onPick}
          />

          {file && (
            <p className="text-center text-xs text-ink-muted">New photo selected — tap Save to upload.</p>
          )}
          {error && <p className="text-center text-sm text-danger">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="action" className="flex-1" disabled={upload.isPending || !file}>
              {upload.isPending ? 'Saving…' : file ? 'Save photo' : 'Choose a photo'}
            </Button>
            {user.avatarUrl && !file && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={clear.isPending}
                onClick={() => clear.mutate()}
              >
                {clear.isPending ? 'Removing…' : 'Remove photo'}
              </Button>
            )}
            {file && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
