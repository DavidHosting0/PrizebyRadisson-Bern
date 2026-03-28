'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useCallback, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

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
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const schedule = useCallback(
    (taskId: string, status: string) => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        patchTask.mutate({ taskId, status });
      }, 320);
    },
    [patchTask],
  );

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

  if (isLoading || !data) return <p className="p-4">Loading…</p>;

  const tasks = data.checklist?.tasks ?? [];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Room {data.roomNumber}</h1>
        <StatusBadge status={data.derivedStatus} />
      </div>
      <ul className="mt-4 space-y-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left active:bg-slate-50"
              onClick={() => {
                const next =
                  t.status === 'NOT_STARTED'
                    ? 'IN_PROGRESS'
                    : t.status === 'IN_PROGRESS'
                      ? 'COMPLETED'
                      : 'NOT_STARTED';
                schedule(t.id, next);
              }}
            >
              <span className="font-medium">{t.label}</span>
              <span className="text-sm text-slate-600">{t.status.replace('_', ' ')}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <label className="block text-sm font-medium text-slate-700">Cleaning photo</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-2 w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto.mutate(f);
          }}
        />
        <p className="mt-1 text-xs text-slate-500">Compressed automatically before upload.</p>
      </div>
    </div>
  );
}
