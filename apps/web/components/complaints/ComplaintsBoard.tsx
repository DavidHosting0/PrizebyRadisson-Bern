'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type {
  ComplaintHeatmapEntryDto,
  GuestComplaintCategory,
  GuestComplaintDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { Button } from '@/components/ui/Button';
import type { FloorPlanRoom } from '@/components/rooms/RoomFloorPlan';
import { RoomFloorPlan } from '@/components/rooms/RoomFloorPlan';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';

type RoomOpt = { id: string; roomNumber: string };

export function ComplaintsBoard() {
  const canWrite = usePermission('COMPLAINTS_WRITE');
  const qc = useQueryClient();
  const [view, setView] = useState<'list' | 'heatmap'>('list');
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<GuestComplaintCategory>('ROOM');
  const [roomId, setRoomId] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['complaints', statusFilter],
    queryFn: () => {
      const q = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
      return api<GuestComplaintDto[]>(`/complaints${q}`);
    },
    enabled: view === 'list',
  });

  const heatQ = useQuery({
    queryKey: ['complaints', 'heatmap'],
    queryFn: () => api<ComplaintHeatmapEntryDto[]>('/complaints/heatmap'),
    enabled: view === 'heatmap',
  });

  const roomsQ = useQuery({
    ...roomsListQueryOptions<FloorPlanRoom>(),
    enabled: view === 'heatmap' || showForm,
  });

  const { data: roomOpts = [] } = useQuery({
    ...roomsListQueryOptions<RoomOpt>(),
    enabled: showForm && category === 'ROOM',
  });

  const createMut = useMutation({
    mutationFn: () =>
      api<GuestComplaintDto>('/complaints', {
        method: 'POST',
        body: JSON.stringify({
          category,
          roomId: category === 'ROOM' ? roomId : null,
          description,
        }),
      }),
    onSuccess: () => {
      setDescription('');
      setErr(null);
      setShowForm(false);
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

  const countByRoomId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of heatQ.data ?? []) m[e.roomId] = e.count;
    return m;
  }, [heatQ.data]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setErr('Beschreibung nötig.');
      return;
    }
    if (category === 'ROOM' && !roomId) {
      setErr('Zimmer wählen.');
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Beschwerden</h1>
          <p className="mt-1 text-sm text-sidebar-muted">
            Gästebeschwerden erfassen und auf dem Floor Plan nach Häufigkeit sehen.
          </p>
        </div>
        {canWrite && (
          <Button type="button" variant="action" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Abbrechen' : 'Neue Beschwerde'}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['list', 'Liste'],
            ['heatmap', 'Heatmap'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={
              view === id
                ? 'rounded-btn bg-action px-3 py-2 text-sm font-medium text-white'
                : 'rounded-btn border border-sidebar-border px-3 py-2 text-sm text-sidebar-muted hover:bg-white/10 hover:text-white'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {showForm && canWrite && (
        <div className={clsx(APP_DARK_CARD, 'p-5')}>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="flex flex-wrap gap-2">
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
                      ? 'rounded-btn bg-action px-3 py-2 text-sm font-medium text-white'
                      : 'rounded-btn border border-sidebar-border px-3 py-2 text-sm text-sidebar-muted hover:bg-white/10 hover:text-white'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {category === 'ROOM' && (
              <label className="block text-sm">
                <span className="font-medium text-white">Zimmer</span>
                <select
                  className={clsx(APP_DARK_INPUT, 'mt-1 w-full py-2')}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  required
                >
                  <option value="">— wählen —</option>
                  {roomOpts.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roomNumber}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium text-white">Beschreibung</span>
              <textarea
                className={clsx(APP_DARK_INPUT, 'mt-1 min-h-[100px] w-full py-2')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>
            {err && <p className="text-sm text-rose-300">{err}</p>}
            <Button type="submit" variant="action" disabled={createMut.isPending}>
              {createMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </form>
        </div>
      )}

      {view === 'list' && (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['OPEN', 'Offen'],
                ['RESOLVED', 'Erledigt'],
                ['ALL', 'Alle'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={
                  statusFilter === id
                    ? 'rounded-btn bg-white/10 px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-btn px-3 py-1.5 text-xs text-sidebar-muted hover:bg-white/10 hover:text-white'
                }
              >
                {label}
              </button>
            ))}
          </div>
          {listQ.isLoading && <p className="text-sm text-sidebar-muted">Laden…</p>}
          <ul className="space-y-3">
            {(listQ.data ?? []).map((c) => (
              <li key={c.id}>
                <div className={clsx(APP_DARK_CARD, 'p-5')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {c.category === 'ROOM'
                          ? `Zimmer ${c.room?.roomNumber ?? '—'}`
                          : 'Andere'}{' '}
                        · {c.status === 'OPEN' ? 'Offen' : 'Erledigt'}
                      </p>
                      <p className="mt-0.5 text-xs text-sidebar-muted">
                        {c.createdBy.name} · {new Date(c.createdAt).toLocaleString('de-CH')}
                      </p>
                    </div>
                    {canWrite && c.status === 'OPEN' && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-0 border-sidebar-border bg-transparent px-2 py-1 text-xs text-white hover:bg-white/10"
                        onClick={() => resolveMut.mutate(c.id)}
                      >
                        Erledigen
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-100">{c.description}</p>
                </div>
              </li>
            ))}
            {!listQ.isLoading && !(listQ.data ?? []).length && (
              <p className="text-sm text-sidebar-muted">Keine Beschwerden.</p>
            )}
          </ul>
        </>
      )}

      {view === 'heatmap' && (
        <>
          {heatQ.isLoading || roomsQ.isLoading ? (
            <p className="text-sm text-sidebar-muted">Laden…</p>
          ) : (
            <div className={clsx(APP_DARK_CARD, 'p-4 md:p-6')}>
              <RoomFloorPlan
                rooms={roomsQ.data ?? []}
                complaintCountByRoomId={countByRoomId}
                onRoomClick={() => setView('list')}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
