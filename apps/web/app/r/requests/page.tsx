'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type RoomOpt = { id: string; roomNumber: string };
type TypeOpt = { id: string; label: string; code: string };

export default function ReceptionRequestsPage() {
  const qc = useQueryClient();
  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api<RoomOpt[]>('/rooms'),
  });
  const { data: types } = useQuery({
    queryKey: ['service-request-types'],
    queryFn: () => api<TypeOpt[]>('/service-requests/types'),
  });

  const [roomId, setRoomId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [description, setDescription] = useState('');

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
      setDescription('');
    },
  });

  const { data: list } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () =>
      api<
        {
          id: string;
          status: string;
          priority: string;
          room: { roomNumber: string };
          type: { label: string };
        }[]
      >('/service-requests'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roomId || !typeId) return;
    create.mutate();
  }

  const inputClass =
    'mt-1.5 w-full min-h-[48px] rounded-btn border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-card focus:border-ink/30 focus:outline-none focus:ring-2 focus:ring-ink/10';

  return (
    <div className="space-y-10 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Service requests</h1>
        <p className="mt-1 text-sm text-ink-muted">Create a request in a few taps.</p>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">New request</h2>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <Card className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink">Room</label>
              <select className={inputClass} value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
                <option value="">Select room…</option>
                {rooms?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink">Type</label>
              <select className={inputClass} value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
                <option value="">Select type…</option>
                {types?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink">Priority</label>
              <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="NORMAL">Normal</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink">Notes</label>
              <textarea
                className={`${inputClass} min-h-[88px] resize-y`}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" fullWidth disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create request'}
            </Button>
          </Card>
        </form>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Active requests</h2>
        <ul className="mt-4 space-y-3">
          {list
            ?.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CANCELLED')
            .map((r) => (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Room {r.room.roomNumber}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{r.type.label}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-muted">{r.status.replace(/_/g, ' ')}</span>
                      <PriorityBadge priority={r.priority} />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
        </ul>
        {list?.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CANCELLED').length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">No active requests.</p>
        )}
      </section>
    </div>
  );
}
