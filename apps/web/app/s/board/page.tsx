'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BoardRoomCard, type BoardRoom } from '@/components/supervisor/BoardRoomCard';
import { AutoAssignModal } from '@/components/supervisor/AutoAssignModal';
import { RoomSlideOver } from '@/components/supervisor/RoomSlideOver';
import { Button } from '@/components/ui/Button';

type AssignmentRow = {
  id: string;
  roomId: string;
  room: { id: string; roomNumber: string; floor: number | null };
  housekeeper: { id: string; name: string; titlePrefix: string };
};

type Hk = { id: string; name: string; email: string; titlePrefix: string };

export default function SupervisorBoardPage() {
  const qc = useQueryClient();
  const [floor, setFloor] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [panelRoomId, setPanelRoomId] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);

  const { data: roomsRaw = [] } = useQuery({
    queryKey: ['rooms', 'supervisor', floor],
    queryFn: () => api<BoardRoom[]>(`/rooms${floor ? `?floor=${encodeURIComponent(floor)}` : ''}`),
  });

  const roomById = useMemo(() => Object.fromEntries(roomsRaw.map((r) => [r.id, r])), [roomsRaw]);

  const queueRooms = useMemo(() => {
    return roomsRaw.filter((r) => {
      if (statusFilter && r.derivedStatus !== statusFilter) return false;
      return true;
    });
  }, [roomsRaw, statusFilter]);

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => api<AssignmentRow[]>('/assignments'),
  });

  const { data: housekeepers = [] } = useQuery({
    queryKey: ['housekeepers'],
    queryFn: () => api<Hk[]>('/users/housekeepers'),
  });

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.roomId)), [assignments]);

  const queueRoomsFiltered = useMemo(() => {
    return queueRooms.filter((r) => !assignedIds.has(r.id));
  }, [queueRooms, assignedIds]);

  const assign = useMutation({
    mutationFn: ({ roomId, housekeeperUserId }: { roomId: string; housekeeperUserId: string }) =>
      api('/assignments', { method: 'POST', body: JSON.stringify({ roomId, housekeeperUserId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  function onDropColumn(housekeeperId: string) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      try {
        const { roomId } = JSON.parse(raw) as { roomId: string };
        if (!roomId) return;
        assign.mutate({ roomId, housekeeperUserId: housekeeperId });
      } catch {
        /* ignore */
      }
    };
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  const floors = useMemo(() => {
    const s = new Set<number>();
    roomsRaw.forEach((r) => {
      if (r.floor != null) s.add(r.floor);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [roomsRaw]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Room assignment</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Drag the grip handle to move a room to a housekeeper column. Open details to edit checklist or notes.
          </p>
        </div>
        <Button variant="action" className="min-h-[48px] shrink-0" onClick={() => setAutoOpen(true)}>
          Auto-assign
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Floor</label>
          <select
            className="mt-1 min-h-[44px] min-w-[120px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          >
            <option value="">All</option>
            {floors.map((f) => (
              <option key={f} value={String(f)}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Status</label>
          <select
            className="mt-1 min-h-[44px] min-w-[160px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="DIRTY">Dirty</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="CLEAN">Clean</option>
            <option value="INSPECTED">Inspected</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 overflow-x-auto pb-4 lg:grid-cols-none lg:flex lg:items-start lg:gap-4">
        <div className="min-h-[200px] min-w-[260px] flex-1 rounded-card border-2 border-dashed border-border bg-surface-muted/50 p-3 lg:max-w-[320px]">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Unassigned queue</h2>
          <p className="mt-1 text-[11px] text-ink-muted">Rooms without an active assignment</p>
          <ul className="mt-4 space-y-3">
            {queueRoomsFiltered.map((r) => (
              <li key={r.id}>
                <BoardRoomCard room={r} draggable onOpen={() => setPanelRoomId(r.id)} />
              </li>
            ))}
          </ul>
          {queueRoomsFiltered.length === 0 && <p className="mt-4 text-sm text-ink-muted">No unassigned rooms.</p>}
        </div>

        {housekeepers.map((hk) => {
          const col = assignments.filter((a) => a.housekeeper.id === hk.id);
          return (
            <div
              key={hk.id}
              className="min-h-[200px] min-w-[260px] flex-1 rounded-card border border-border bg-surface p-3 shadow-card lg:max-w-[320px]"
              onDragOver={onDragOver}
              onDrop={onDropColumn(hk.id)}
            >
              <h2 className="text-sm font-semibold text-ink">
                {formatUserWithTitlePrefix(hk.name, hk.titlePrefix)}
              </h2>
              <p className="text-[11px] text-ink-muted">{hk.email}</p>
              <ul className="mt-4 space-y-3">
                {col.map((a) => {
                  const full = roomById[a.roomId];
                  if (!full) return null;
                  return (
                    <li key={a.id}>
                      <BoardRoomCard room={full} draggable onOpen={() => setPanelRoomId(full.id)} />
                    </li>
                  );
                })}
              </ul>
              {col.length === 0 && <p className="mt-4 text-sm text-ink-muted">No rooms assigned.</p>}
            </div>
          );
        })}
      </div>

      <RoomSlideOver roomId={panelRoomId} open={!!panelRoomId} onClose={() => setPanelRoomId(null)} />
      <AutoAssignModal open={autoOpen} onClose={() => setAutoOpen(false)} />
    </div>
  );
}
