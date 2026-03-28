'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/toast/ToastProvider';

type RoomOpt = { id: string; roomNumber: string };
type TypeOpt = { id: string; label: string; code: string };

export function NewRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api<RoomOpt[]>('/rooms'),
    enabled: open,
  });
  const { data: types = [] } = useQuery({
    queryKey: ['service-request-types'],
    queryFn: () => api<TypeOpt[]>('/service-requests/types'),
    enabled: open,
  });

  const [roomId, setRoomId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [description, setDescription] = useState('');
  const [roomQ, setRoomQ] = useState('');

  const filteredRooms = useMemo(() => {
    const q = roomQ.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.roomNumber.toLowerCase().includes(q));
  }, [rooms, roomQ]);

  const create = useMutation({
    mutationFn: () =>
      api('/service-requests', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          typeId,
          priority,
          description: description || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-requests'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      setDescription('');
      setRoomId('');
      setTypeId('');
      setPriority('NORMAL');
      setRoomQ('');
      toast.push('Request created', 'success');
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roomId || !typeId) return;
    create.mutate();
  }

  if (!open) return null;

  const field =
    'mt-1.5 w-full min-h-[44px] rounded-btn border border-border bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        className="w-full max-w-lg rounded-card border border-border bg-surface shadow-lift"
        role="dialog"
        aria-labelledby="new-req-title"
      >
        <div className="border-b border-border px-6 py-4">
          <h2 id="new-req-title" className="text-lg font-semibold text-ink">
            New service request
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Select room, type, and priority.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <div>
            <label className="text-sm font-medium text-ink">Room</label>
            <input
              type="search"
              className={field}
              placeholder="Search room number…"
              value={roomQ}
              onChange={(e) => setRoomQ(e.target.value)}
            />
            <select
              className={`${field} mt-2 max-h-40`}
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
              size={Math.min(8, Math.max(3, filteredRooms.length))}
            >
              <option value="">Select room…</option>
              {filteredRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Request type</label>
            <select className={field} value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
              <option value="">Select type…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-sm font-medium text-ink">Priority</span>
            <div className="mt-2 flex gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="prio"
                  checked={priority === 'NORMAL'}
                  onChange={() => setPriority('NORMAL')}
                  className="text-action"
                />
                Normal
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="prio"
                  checked={priority === 'URGENT'}
                  onChange={() => setPriority('URGENT')}
                  className="text-danger"
                />
                Urgent
              </label>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Notes (optional)</label>
            <textarea
              className={`${field} min-h-[80px] resize-y`}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" variant="action" className="min-h-[48px] min-w-[140px]" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create request'}
            </Button>
            <Button type="button" variant="secondary" className="min-h-[48px]" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
