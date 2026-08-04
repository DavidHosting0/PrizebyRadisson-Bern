'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ComplaintHeatmapEntryDto,
  GuestComplaintCategory,
  GuestComplaintDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { FloorPlanRoom } from '@/components/rooms/RoomFloorPlan';
import { RoomFloorPlan } from '@/components/rooms/RoomFloorPlan';

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
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Beschwerden</h1>
          <p className="mt-1 text-sm text-ink-muted">
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
                : 'rounded-btn border border-border bg-surface px-3 py-2 text-sm text-ink-muted hover:bg-surface-muted'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {showForm && canWrite && (
        <Card>
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
                      : 'rounded-btn border border-border px-3 py-2 text-sm'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {category === 'ROOM' && (
              <label className="block text-sm">
                <span className="font-medium text-ink">Zimmer</span>
                <select
                  className="mt-1 w-full rounded-btn border border-border px-3 py-2 text-sm"
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
              <span className="font-medium text-ink">Beschreibung</span>
              <textarea
                className="mt-1 min-h-[100px] w-full rounded-btn border border-border px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>
            {err && <p className="text-sm text-danger">{err}</p>}
            <Button type="submit" variant="action" disabled={createMut.isPending}>
              {createMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </form>
        </Card>
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
                    ? 'rounded-btn bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink'
                    : 'rounded-btn px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-muted'
                }
              >
                {label}
              </button>
            ))}
          </div>
          {listQ.isLoading && <p className="text-sm text-ink-muted">Laden…</p>}
          <ul className="space-y-3">
            {(listQ.data ?? []).map((c) => (
              <li key={c.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {c.category === 'ROOM'
                          ? `Zimmer ${c.room?.roomNumber ?? '—'}`
                          : 'Andere'}{' '}
                        · {c.status === 'OPEN' ? 'Offen' : 'Erledigt'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {c.createdBy.name} · {new Date(c.createdAt).toLocaleString('de-CH')}
                      </p>
                    </div>
                    {canWrite && c.status === 'OPEN' && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-0 px-2 py-1 text-xs"
                        onClick={() => resolveMut.mutate(c.id)}
                      >
                        Erledigen
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{c.description}</p>
                </Card>
              </li>
            ))}
            {!listQ.isLoading && !(listQ.data ?? []).length && (
              <p className="text-sm text-ink-muted">Keine Beschwerden.</p>
            )}
          </ul>
        </>
      )}

      {view === 'heatmap' && (
        <>
          {heatQ.isLoading || roomsQ.isLoading ? (
            <p className="text-sm text-ink-muted">Laden…</p>
          ) : (
            <RoomFloorPlan
              rooms={roomsQ.data ?? []}
              complaintCountByRoomId={countByRoomId}
              onRoomClick={() => setView('list')}
            />
          )}
        </>
      )}
    </div>
  );
}
