'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { ChecklistToggle } from '@/components/ChecklistToggle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LostFoundReportModal } from '@/components/housekeeper/LostFoundReportModal';

type Task = {
  id: string;
  code: string;
  label: string;
  status: string;
};

type RoomDetail = {
  id: string;
  roomNumber: string;
  derivedStatus: string;
  checklist: { stateId: string; tasks: Task[] } | null;
};

export default function RoomChecklistPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lostFoundOpen, setLostFoundOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['room', id],
    queryFn: () => api<RoomDetail>(`/rooms/${id}`),
  });

  const patchTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api(`/rooms/${id}/checklist/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room', id] }),
  });

  /** One tap: mark complete, or tap again to undo (not started). */
  const toggleTask = (t: Task) => {
    const next = t.status === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED';
    patchTask.mutate({ taskId: t.id, status: next });
  };

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1600 });
      const presign = await api<{ uploadUrl: string; photoId: string }>(`/rooms/${id}/photos/presign`, {
        method: 'POST',
        body: JSON.stringify({ contentType: compressed.type || 'image/jpeg' }),
      });
      await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: compressed,
        headers: { 'Content-Type': compressed.type || 'image/jpeg' },
      });
      await api(`/rooms/${id}/photos/complete`, {
        method: 'POST',
        body: JSON.stringify({
          photoId: presign.photoId,
          mime: compressed.type || 'image/jpeg',
          bytes: compressed.size,
        }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room', id] }),
  });

  const tasks = data?.checklist?.tasks ?? [];
  const progress = useMemo(() => {
    const total = tasks.length;
    if (!total) return 0;
    const done = tasks.filter((t) => t.status === 'COMPLETED').length;
    return Math.round((done / total) * 100);
  }, [tasks]);

  if (isLoading || !data) {
    return (
      <div className="p-4">
        <p className="text-sm text-ink-muted">Loading room…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Link
          href="/h"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-card tap-scale"
          aria-label="Back to rooms"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Room {data.roomNumber}</h1>
          <div className="mt-1">
            <StatusBadge status={data.derivedStatus} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="danger"
          className="min-h-[48px] border-0 bg-red-600 text-white shadow-sm hover:bg-red-700 hover:text-white sm:min-w-[200px]"
          onClick={() => setLostFoundOpen(true)}
        >
          Report lost &amp; found
        </Button>
      </div>

      <LostFoundReportModal
        open={lostFoundOpen}
        onClose={() => setLostFoundOpen(false)}
        roomId={data.id}
        roomNumber={data.roomNumber}
      />

      <Card>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Checklist progress</p>
          <span className="text-lg font-semibold tabular-nums text-ink">{progress}%</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-success transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-ink-muted">Tap once to mark done. Tap again to undo.</p>
      </Card>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Tasks</h2>
        <ul className="mt-3 space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <ChecklistToggle task={t} onToggle={() => toggleTask(t)} />
            </li>
          ))}
        </ul>
        {tasks.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">No checklist tasks for this room.</p>
        )}
      </section>

      <section className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto.mutate(f);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          fullWidth
          disabled={uploadPhoto.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {uploadPhoto.isPending ? 'Uploading…' : 'Upload cleaning photo'}
        </Button>
        <p className="text-center text-xs text-ink-muted">Photos are compressed before upload.</p>
      </section>

      {progress === 100 && tasks.length > 0 && (
        <section className="rounded-card border border-success/30 bg-success-muted/50 p-4 text-center">
          <p className="font-medium text-ink">All tasks complete</p>
          <p className="mt-1 text-sm text-ink-muted">Room status updates automatically.</p>
        </section>
      )}
    </div>
  );
}
