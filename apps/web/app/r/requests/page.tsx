'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';

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

  return (
    <div className="space-y-8 p-4">
      <section>
        <h2 className="text-lg font-semibold">New request</h2>
        <form className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium">Room</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {rooms?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Type</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {types?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Priority</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="NORMAL">Normal</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={create.isPending}
            className="w-full rounded-xl bg-accent py-2 font-medium text-white"
          >
            Create
          </button>
        </form>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Active requests</h2>
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {list
            ?.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CANCELLED')
            .map((r) => (
              <li key={r.id} className="px-3 py-2 text-sm">
                <span className="font-medium">Room {r.room.roomNumber}</span> · {r.type.label}{' '}
                <span className="text-slate-500">({r.status})</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
