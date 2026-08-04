'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DailyCleaningPlanResponse, DailyCleaningTaskDto } from '@housekeeping/shared';
import { formatFloorLabel, hotelTodayIso } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BoardRoomCard, type BoardRoom } from '@/components/supervisor/BoardRoomCard';
import { AutoAssignSetupModal } from '@/components/supervisor/AutoAssignModal';
import { RoomSlideOver } from '@/components/supervisor/RoomSlideOver';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type AssignmentRow = {
  id: string;
  roomId: string;
  room: { id: string; roomNumber: string; floor: number | null };
  housekeeper: { id: string; name: string; titlePrefix: string };
};

type Hk = { id: string; name: string; email: string; titlePrefix: string };

function PublicTaskCard({
  task,
  assignees,
  onReassign,
  onComplete,
  busy,
}: {
  task: DailyCleaningTaskDto;
  assignees: Hk[];
  onReassign: (taskId: string, assigneeUserId: string) => void;
  onComplete: (taskId: string) => void;
  busy?: boolean;
}) {
  return (
    <Card className="space-y-2 border border-dashed border-border bg-surface-muted/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{task.publicAreaName}</p>
          {task.floor != null && (
            <p className="text-[11px] text-ink-muted">{formatFloorLabel(task.floor)}</p>
          )}
          <span className="mt-1 inline-block rounded-btn bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900">
            Public
          </span>
        </div>
        {!task.completedAt && (
          <Button
            variant="ghost"
            className="min-h-[36px] shrink-0 px-2 text-xs"
            disabled={busy}
            onClick={() => onComplete(task.id)}
          >
            Done
          </Button>
        )}
      </div>
      {task.completedAt ? (
        <p className="text-[11px] text-emerald-700">Completed</p>
      ) : (
        <select
          className="min-h-[36px] w-full rounded-btn border border-border bg-surface px-2 text-xs"
          value={task.assigneeUserId ?? ''}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onReassign(task.id, v);
          }}
        >
          <option value="">— Reassign —</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {formatUserWithTitlePrefix(a.name, a.titlePrefix)}
            </option>
          ))}
        </select>
      )}
    </Card>
  );
}

export default function SupervisorBoardPage() {
  const qc = useQueryClient();
  const today = hotelTodayIso();
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

  const { data: plan } = useQuery({
    queryKey: ['assignments', 'daily-plan', today],
    queryFn: () =>
      api<DailyCleaningPlanResponse>(
        `/assignments/daily-plan?date=${encodeURIComponent(today)}`,
      ),
  });

  const restantByRoomId = useMemo(() => {
    const map = new Map<string, { overdueDays: number | null }>();
    for (const t of plan?.tasks ?? []) {
      if (t.kind === 'ROOM' && t.roomId && t.workType === 'RESTANT') {
        map.set(t.roomId, { overdueDays: t.overdueDays });
      }
    }
    return map;
  }, [plan]);

  const overdueByRoomId = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of plan?.tasks ?? []) {
      if (t.kind === 'ROOM' && t.roomId && t.overdueDays != null && t.overdueDays > 0) {
        map.set(t.roomId, t.overdueDays);
      }
    }
    return map;
  }, [plan]);

  const publicTasks = useMemo(
    () => (plan?.tasks ?? []).filter((t) => t.kind === 'PUBLIC_AREA'),
    [plan],
  );

  const publicByAssignee = useMemo(() => {
    const map = new Map<string, DailyCleaningTaskDto[]>();
    const unassigned: DailyCleaningTaskDto[] = [];
    for (const t of publicTasks) {
      if (!t.assigneeUserId) {
        unassigned.push(t);
        continue;
      }
      const list = map.get(t.assigneeUserId) ?? [];
      list.push(t);
      map.set(t.assigneeUserId, list);
    }
    return { map, unassigned };
  }, [publicTasks]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.roomId)), [assignments]);

  const queueRoomsFiltered = useMemo(() => {
    return queueRooms.filter((r) => !assignedIds.has(r.id));
  }, [queueRooms, assignedIds]);

  const reassignOptions = useMemo(() => {
    const byId = new Map<string, Hk>();
    for (const hk of housekeepers) byId.set(hk.id, hk);
    for (const a of plan?.manualAssignees ?? []) {
      if (!byId.has(a.id)) {
        byId.set(a.id, {
          id: a.id,
          name: a.name,
          email: '',
          titlePrefix: a.titlePrefix,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [housekeepers, plan]);

  const boardColumns = useMemo(() => {
    const byId = new Map<string, Hk>();
    for (const hk of housekeepers) byId.set(hk.id, hk);
    for (const a of assignments) {
      if (!byId.has(a.housekeeper.id)) {
        byId.set(a.housekeeper.id, {
          id: a.housekeeper.id,
          name: a.housekeeper.name,
          email: '',
          titlePrefix: a.housekeeper.titlePrefix,
        });
      }
    }
    for (const a of plan?.manualAssignees ?? []) {
      if (!byId.has(a.id) && publicByAssignee.map.has(a.id)) {
        byId.set(a.id, {
          id: a.id,
          name: a.name,
          email: '',
          titlePrefix: a.titlePrefix,
        });
      }
    }
    for (const userId of publicByAssignee.map.keys()) {
      if (!byId.has(userId)) {
        const fromPlan = plan?.manualAssignees.find((a) => a.id === userId);
        byId.set(userId, {
          id: userId,
          name: fromPlan?.name ?? userId,
          email: '',
          titlePrefix: fromPlan?.titlePrefix ?? 'CLEANER',
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [housekeepers, assignments, plan, publicByAssignee]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['assignments'] });
    qc.invalidateQueries({ queryKey: ['rooms'] });
    qc.invalidateQueries({ queryKey: ['assignments', 'daily-plan'] });
  };

  const assign = useMutation({
    mutationFn: ({ roomId, housekeeperUserId }: { roomId: string; housekeeperUserId: string }) =>
      api('/assignments', { method: 'POST', body: JSON.stringify({ roomId, housekeeperUserId }) }),
    onSuccess: invalidateAll,
  });

  const unassign = useMutation({
    mutationFn: (roomId: string) => api(`/assignments/room/${roomId}`, { method: 'DELETE' }),
    onSuccess: invalidateAll,
  });

  const savePlan = useMutation({
    mutationFn: () =>
      api(`/assignments/daily-plan/save?date=${encodeURIComponent(today)}`, { method: 'POST' }),
    onSuccess: invalidateAll,
  });

  const patchPublic = useMutation({
    mutationFn: ({ taskId, assigneeUserId }: { taskId: string; assigneeUserId: string }) =>
      api(`/assignments/daily-plan/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeUserId, pinned: true }),
      }),
    onSuccess: invalidateAll,
  });

  const completePublic = useMutation({
    mutationFn: (taskId: string) =>
      api(`/assignments/daily-plan/tasks/${taskId}/complete`, { method: 'POST' }),
    onSuccess: invalidateAll,
  });

  const publicBusy = patchPublic.isPending || completePublic.isPending;

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

  function onDropUnassigned(e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { roomId } = JSON.parse(raw) as { roomId: string };
      if (!roomId) return;
      unassign.mutate(roomId);
    } catch {
      /* ignore */
    }
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

  const canSave = plan?.suggested && plan.status !== 'SAVED';

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Room assignment</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Drag rooms between cleaners or back to Unassigned. Run auto assignment, then save for
            the day. Scroll sideways for all columns.
          </p>
          {plan?.status === 'SAVED' && plan.savedAt && (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Saved for today · {new Date(plan.savedAt).toLocaleString()}
            </p>
          )}
          {canSave && (
            <p className="mt-1 text-xs font-medium text-amber-800">
              Auto assignment on the board — save to lock it for today.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/s/public-areas"
            className="inline-flex min-h-[44px] items-center rounded-btn border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
          >
            Public areas
          </Link>
          <Link
            href="/s/departures"
            className="inline-flex min-h-[44px] items-center rounded-btn border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
          >
            Departures
          </Link>
          {canSave && (
            <Button
              variant="secondary"
              className="min-h-[48px] shrink-0"
              disabled={savePlan.isPending}
              onClick={() => savePlan.mutate()}
            >
              {savePlan.isPending ? 'Saving…' : 'Save for today'}
            </Button>
          )}
          <Button variant="action" className="min-h-[48px] shrink-0" onClick={() => setAutoOpen(true)}>
            Auto room assignment
          </Button>
        </div>
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

      <div className="-mx-4 min-w-0 overflow-x-scroll overflow-y-visible overscroll-x-contain px-4 pb-4 md:-mx-8 md:px-8">
        <div className="flex w-max items-start gap-4">
          <div
            className="min-h-[200px] w-[280px] shrink-0 rounded-card border-2 border-dashed border-border bg-surface-muted/50 p-3"
            onDragOver={onDragOver}
            onDrop={onDropUnassigned}
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Unassigned queue
            </h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              Drop here to unassign · rooms without an active assignment
            </p>
            <ul className="mt-4 space-y-3">
              {queueRoomsFiltered.map((r) => (
                <li key={r.id}>
                  <BoardRoomCard
                    room={r}
                    draggable
                    onOpen={() => setPanelRoomId(r.id)}
                    isRestant={restantByRoomId.has(r.id)}
                    overdueDays={overdueByRoomId.get(r.id) ?? restantByRoomId.get(r.id)?.overdueDays}
                  />
                </li>
              ))}
            </ul>
            {publicByAssignee.unassigned.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Public (unassigned)
                </p>
                {publicByAssignee.unassigned.map((t) => (
                  <PublicTaskCard
                    key={t.id}
                    task={t}
                    assignees={reassignOptions}
                    busy={publicBusy}
                    onReassign={(taskId, assigneeUserId) =>
                      patchPublic.mutate({ taskId, assigneeUserId })
                    }
                    onComplete={(taskId) => completePublic.mutate(taskId)}
                  />
                ))}
              </div>
            )}
            {queueRoomsFiltered.length === 0 && publicByAssignee.unassigned.length === 0 && (
              <p className="mt-4 text-sm text-ink-muted">No unassigned rooms.</p>
            )}
          </div>

          {boardColumns.map((hk) => {
            const col = assignments.filter((a) => a.housekeeper.id === hk.id);
            const publics = publicByAssignee.map.get(hk.id) ?? [];
            return (
              <div
                key={hk.id}
                className="min-h-[200px] w-[280px] shrink-0 rounded-card border border-border bg-surface p-3 shadow-card"
                onDragOver={onDragOver}
                onDrop={onDropColumn(hk.id)}
              >
                <h2 className="truncate text-sm font-semibold text-ink">
                  {formatUserWithTitlePrefix(hk.name, hk.titlePrefix)}
                </h2>
                {hk.email ? (
                  <p className="truncate text-[11px] text-ink-muted">{hk.email}</p>
                ) : null}
                <ul className="mt-4 space-y-3">
                  {col.map((a) => {
                    const full = roomById[a.roomId];
                    if (!full) return null;
                    return (
                      <li key={a.id}>
                        <BoardRoomCard
                          room={full}
                          draggable
                          onOpen={() => setPanelRoomId(full.id)}
                          isRestant={restantByRoomId.has(full.id)}
                          overdueDays={
                            overdueByRoomId.get(full.id) ?? restantByRoomId.get(full.id)?.overdueDays
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
                {publics.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      Public areas
                    </p>
                    {publics.map((t) => (
                      <PublicTaskCard
                        key={t.id}
                        task={t}
                        assignees={reassignOptions}
                        busy={publicBusy}
                        onReassign={(taskId, assigneeUserId) =>
                          patchPublic.mutate({ taskId, assigneeUserId })
                        }
                        onComplete={(taskId) => completePublic.mutate(taskId)}
                      />
                    ))}
                  </div>
                )}
                {col.length === 0 && publics.length === 0 && (
                  <p className="mt-4 text-sm text-ink-muted">No rooms assigned.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <RoomSlideOver roomId={panelRoomId} open={!!panelRoomId} onClose={() => setPanelRoomId(null)} />
      <AutoAssignSetupModal
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        date={today}
        onRan={invalidateAll}
      />
    </div>
  );
}
