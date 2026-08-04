'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GuestComplaintCategory, GuestComplaintDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

type RoomOpt = { id: string; roomNumber: string };

export function ComplaintsBoard() {
  const canWrite = usePermission('COMPLAINTS_WRITE');
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<GuestComplaintCategory>('ROOM');
  const [roomId, setRoomId] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['complaints', 'open'],
    queryFn: () => api<GuestComplaintDto[]>('/complaints?status=OPEN'),
  });

  const roomsQ = useQuery({
    queryKey: ['rooms', 'list'],
    queryFn: () => api<RoomOpt[]>('/rooms'),
    enabled: showForm && category === 'ROOM',
  });

  const createMut = useMutation({
    mutationFn: () =>
      api('/complaints', {
        method: 'POST',
        body: JSON.stringify({
          category,
          roomId: category === 'ROOM' ? roomId : null,
          description,
        }),
      }),
    onSuccess: () => {
      setDescription('');
      setShowForm(false);
      setErr(null);
      qc.invalidateQueries({ queryKey: ['complaints'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) =>
      api(`/complaints/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complaints'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim() || (category === 'ROOM' && !roomId)) {
      setErr('Angaben unvollständig.');
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="space-y-2 p-2.5 pb-3">
      {canWrite && (
        <Button
          type="button"
          variant={showForm ? 'secondary' : 'action'}
          className="min-h-[28px] w-full text-xs"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Abbrechen' : 'Neue Beschwerde'}
        </Button>
      )}

      {showForm && canWrite && (
        <Card padding>
          <form className="space-y-2" onSubmit={onSubmit}>
            <div className="flex gap-1">
              {(
                [
                  ['ROOM', 'Zimmer'],
                  ['OTHER', 'Andere'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={
                    category === id
                      ? 'flex-1 rounded-md bg-action px-2 py-1 text-[10px] font-semibold text-white'
                      : 'flex-1 rounded-md border border-border px-2 py-1 text-[10px]'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {category === 'ROOM' && (
              <select
                className="w-full rounded-md border border-border px-2 py-1 text-xs"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
              >
                <option value="">Zimmer…</option>
                {(roomsQ.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber}
                  </option>
                ))}
              </select>
            )}
            <textarea
              className="min-h-[70px] w-full rounded-md border border-border px-2 py-1 text-xs"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            {err && <p className="text-[10px] text-danger">{err}</p>}
            <Button type="submit" variant="action" className="min-h-[28px] text-xs" disabled={createMut.isPending}>
              Speichern
            </Button>
          </form>
        </Card>
      )}

      {listQ.isLoading && <p className="text-[11px] text-ink-muted">Laden…</p>}
      <ul className="space-y-1.5">
        {(listQ.data ?? []).map((c) => (
          <li key={c.id}>
            <Card padding>
              <div className="flex items-start justify-between gap-1">
                <p className="text-[10px] font-semibold text-ink">
                  {c.category === 'ROOM' ? `Zi. ${c.room?.roomNumber ?? '—'}` : 'Andere'}
                </p>
                {canWrite && (
                  <button
                    type="button"
                    className="text-[9px] text-action"
                    onClick={() => resolveMut.mutate(c.id)}
                  >
                    Erledigen
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[11px] text-ink">{c.description}</p>
            </Card>
          </li>
        ))}
        {!listQ.isLoading && !(listQ.data ?? []).length && (
          <p className="text-[11px] text-ink-muted">Keine offenen Beschwerden.</p>
        )}
      </ul>
    </div>
  );
}
