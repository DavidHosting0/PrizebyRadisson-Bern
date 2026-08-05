'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import type { DailyCleaningPlanResponse, DailyCleaningTaskDto } from '@housekeeping/shared';
import { formatFloorLabel, hotelTodayIso } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { BoardRoomCard, boardTileKindForRoom, type BoardRoom, type BoardTileKind } from '@/components/supervisor/BoardRoomCard';
import { AutoAssignSetupModal } from '@/components/supervisor/AutoAssignModal';
import { RoomSlideOver } from '@/components/supervisor/RoomSlideOver';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { Button } from '@/components/ui/Button';
import { CommandPaletteTrigger } from '@/components/command/CommandPaletteTrigger';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

type AssignmentRow = {
  id: string;
  roomId: string;
  room: { id: string; roomNumber: string; floor: number | null };
  housekeeper: { id: string; name: string; titlePrefix: string };
};

type Hk = { id: string; name: string; email: string; titlePrefix: string };

type DragState = {
  room: BoardRoom;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  active: boolean;
  tileKind: BoardTileKind;
  isRestant?: boolean;
  overdueDays?: number | null;
};

const DRAG_THRESHOLD = 6;

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
    <div className="space-y-2 rounded-card border border-teal-950/40 bg-[#0D5C63] p-3 shadow-[0_1px_2px_rgba(13,92,99,0.35)] transition hover:brightness-110">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-teal-50">{task.publicAreaName}</p>
          {task.floor != null && (
            <p className="text-[11px] text-teal-100/75">{formatFloorLabel(task.floor)}</p>
          )}
          <span className="mt-1 inline-block rounded-btn bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-50">
            Public
          </span>
        </div>
        {!task.completedAt && (
          <Button
            variant="ghost"
            className="min-h-[36px] shrink-0 px-2 text-xs text-teal-100 hover:bg-black/20 hover:text-white"
            disabled={busy}
            onClick={() => onComplete(task.id)}
          >
            Done
          </Button>
        )}
      </div>
      {task.completedAt ? (
        <p className="text-[11px] text-emerald-200">Completed</p>
      ) : (
        <select
          className="min-h-[36px] w-full rounded-btn border border-teal-950/50 bg-teal-950/40 px-2 text-xs text-teal-50"
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
    </div>
  );
}

export default function SupervisorBoardPage() {
  const qc = useQueryClient();
  const today = hotelTodayIso();
  const { enterMobile } = useSupervisorMobileMode();
  const [floor, setFloor] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [panelRoomId, setPanelRoomId] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const pendingPointer = useRef<{
    room: BoardRoom;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    tileKind: BoardTileKind;
    isRestant?: boolean;
    overdueDays?: number | null;
  } | null>(null);

  const { data: roomsRaw = [] } = useQuery({
    queryKey: ['rooms', 'supervisor', floor],
    queryFn: () => api<BoardRoom[]>(`/rooms${floor ? `?floor=${encodeURIComponent(floor)}` : ''}`),
  });

  const roomById = useMemo(() => Object.fromEntries(roomsRaw.map((r) => [r.id, r])), [roomsRaw]);

  const queueRooms = useMemo(() => {
    return roomsRaw.filter((r) => {
      if (statusFilter) return r.derivedStatus === statusFilter;
      // Cleaning assignment queue only — INSPECTED/CLEAN stay for the inspection flow
      // (still clean from yesterday; need re-inspect, not a cleaner assignment).
      return r.derivedStatus === 'DIRTY' || r.derivedStatus === 'IN_PROGRESS';
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

  const finishDrop = useCallback(
    (roomId: string, target: string | null) => {
      if (!target) return;
      if (target === 'unassigned') {
        unassign.mutate(roomId);
        return;
      }
      assign.mutate({ roomId, housekeeperUserId: target });
    },
    [assign, unassign],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const pending = pendingPointer.current;
      if (pending && !dragRef.current) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        const next: DragState = {
          room: pending.room,
          x: e.clientX,
          y: e.clientY,
          offsetX: pending.offsetX,
          offsetY: pending.offsetY,
          active: true,
          tileKind: pending.tileKind,
          isRestant: pending.isRestant,
          overdueDays: pending.overdueDays,
        };
        dragRef.current = next;
        pendingPointer.current = null;
        setDrag(next);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        return;
      }

      const current = dragRef.current;
      if (!current) return;
      const next = { ...current, x: e.clientX, y: e.clientY };
      dragRef.current = next;
      setDrag(next);

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zone = el?.closest('[data-drop-zone]') as HTMLElement | null;
      const id = zone?.dataset.dropZone ?? null;
      if (id !== dropTargetRef.current) {
        dropTargetRef.current = id;
        setDropTarget(id);
      }
    }

    function onUp(e: PointerEvent) {
      const pending = pendingPointer.current;
      if (pending && !dragRef.current) {
        pendingPointer.current = null;
        // Click without drag → open details
        setPanelRoomId(pending.room.id);
        return;
      }

      const current = dragRef.current;
      if (!current) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zone = el?.closest('[data-drop-zone]') as HTMLElement | null;
      const target = zone?.dataset.dropZone ?? dropTargetRef.current;
      finishDrop(current.room.id, target);

      dragRef.current = null;
      dropTargetRef.current = null;
      pendingPointer.current = null;
      setDrag(null);
      setDropTarget(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [finishDrop]);

  function startRoomDrag(
    e: React.PointerEvent,
    room: BoardRoom,
    meta?: { isRestant?: boolean; overdueDays?: number | null },
  ) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isRestant = meta?.isRestant;
    pendingPointer.current = {
      room,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      tileKind: boardTileKindForRoom(room, isRestant),
      isRestant,
      overdueDays: meta?.overdueDays,
    };
  }

  const floors = useMemo(() => {
    const s = new Set<number>();
    roomsRaw.forEach((r) => {
      if (r.floor != null) s.add(r.floor);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [roomsRaw]);

  const canSave = plan?.suggested && plan.status !== 'SAVED';
  const draggingRoomId = drag?.room.id ?? null;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col md:h-full">
      <AppPageChrome
        title="Room assignment"
        status={
          <>
            {plan?.status === 'SAVED' && plan.savedAt && (
              <span className="hidden truncate text-xs font-medium text-emerald-300 sm:inline">
                Saved · {new Date(plan.savedAt).toLocaleString()}
              </span>
            )}
            {canSave && (
              <span className="hidden truncate text-xs font-medium text-amber-200 sm:inline">
                Unsaved auto-assign
              </span>
            )}
          </>
        }
        actions={
          <>
            <div className="hidden items-center gap-2 md:flex">
              <CommandPaletteTrigger onDark className="min-h-[40px] gap-2 px-3 text-xs" />
              <LanguageSwitcher compact onDark />
              <Button
                type="button"
                variant="ghost"
                className="min-h-[40px] border border-sidebar-border bg-transparent px-3 text-xs text-sidebar-muted hover:bg-white/10 hover:text-white"
                onClick={enterMobile}
              >
                Mobile view
              </Button>
            </div>
            <Link
              href="/s/public-areas"
              className="inline-flex min-h-[40px] items-center rounded-btn border border-sidebar-border bg-sidebar-hover px-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Public areas
            </Link>
            <Link
              href="/s/departures"
              className="inline-flex min-h-[40px] items-center rounded-btn border border-sidebar-border bg-sidebar-hover px-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Departures
            </Link>
            {canSave && (
              <Button
                variant="secondary"
                className="min-h-[40px] shrink-0 border-0 bg-white/10 text-white hover:bg-white/15"
                disabled={savePlan.isPending}
                onClick={() => savePlan.mutate()}
              >
                {savePlan.isPending ? 'Saving…' : 'Save for today'}
              </Button>
            )}
            <Button
              variant="action"
              className="min-h-[40px] shrink-0 shadow-md"
              onClick={() => setAutoOpen(true)}
            >
              Auto room assignment
            </Button>
          </>
        }
        toolbar={
          <>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
                Floor
              </label>
              <select
                className="mt-1 min-h-[40px] min-w-[120px] rounded-btn border border-sidebar-border bg-sidebar px-3 text-sm text-white"
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
              <label className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
                Status
              </label>
              <select
                className="mt-1 min-h-[40px] min-w-[160px] rounded-btn border border-sidebar-border bg-sidebar px-3 text-sm text-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All (cleaning)</option>
                <option value="DIRTY">Dirty</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="CLEAN">Clean</option>
                <option value="INSPECTED">Inspected</option>
              </select>
            </div>
          </>
        }
      />

      <AppPageBody canvas className="overflow-x-auto overflow-y-auto overscroll-x-contain">
        <div className="flex w-max items-stretch gap-3 p-3 md:gap-4 md:p-4">
            <div
              data-drop-zone="unassigned"
              className={clsx(
                'min-h-[280px] w-[300px] shrink-0 overflow-hidden rounded-card border transition-all duration-200',
                dropTarget === 'unassigned'
                  ? 'border-action bg-[#1A2332] shadow-[0_0_0_3px_rgba(59,111,160,0.25)]'
                  : 'border-sidebar-border/50 bg-[#1A2332]',
              )}
            >
              <div className="border-b border-white/10 px-3.5 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
                  Unassigned
                </h2>
                <p className="mt-0.5 text-[11px] text-sidebar-muted/80">
                  Dirty / in progress only · drop here to unassign
                </p>
              </div>
              <div className="space-y-2.5 p-3">
                {queueRoomsFiltered.map((r) => (
                  <BoardRoomCard
                    key={r.id}
                    room={r}
                    draggable
                    dragging={draggingRoomId === r.id}
                    onOpen={() => setPanelRoomId(r.id)}
                    isRestant={restantByRoomId.has(r.id)}
                    overdueDays={overdueByRoomId.get(r.id) ?? restantByRoomId.get(r.id)?.overdueDays}
                    onPointerDownDrag={(e, room) =>
                      startRoomDrag(e, room, {
                        isRestant: restantByRoomId.has(room.id),
                        overdueDays:
                          overdueByRoomId.get(room.id) ?? restantByRoomId.get(room.id)?.overdueDays,
                      })
                    }
                  />
                ))}
                {publicByAssignee.unassigned.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
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
                  <p className="py-6 text-center text-sm text-sidebar-muted">No unassigned rooms.</p>
                )}
              </div>
            </div>

            {boardColumns.map((hk) => {
              const col = assignments.filter((a) => a.housekeeper.id === hk.id);
              const publics = publicByAssignee.map.get(hk.id) ?? [];
              const active = dropTarget === hk.id;
              return (
                <div
                  key={hk.id}
                  data-drop-zone={hk.id}
                  className={clsx(
                    'flex min-h-[280px] w-[300px] shrink-0 flex-col overflow-hidden rounded-card border transition-all duration-200',
                    active
                      ? 'border-action bg-[#1A2332] shadow-[0_0_0_3px_rgba(59,111,160,0.25)]'
                      : 'border-sidebar-border/50 bg-[#1A2332]',
                  )}
                >
                  <div className="flex items-center gap-3 border-b border-white/10 bg-[#15202e] px-3.5 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-action/30 text-xs font-bold text-white ring-1 ring-white/10">
                      {hk.name
                        .split(/\s+/)
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-white">
                        {formatUserWithTitlePrefix(hk.name, hk.titlePrefix)}
                      </h2>
                      <p className="truncate text-[11px] text-sidebar-muted">
                        {col.length} room{col.length === 1 ? '' : 's'}
                        {hk.email ? ` · ${hk.email}` : ''}
                      </p>
                    </div>
                  </div>
                  {col.length === 0 && publics.length === 0 && (
                    <div className="px-3 pt-3">
                      <p className="rounded-lg border border-dashed border-white/15 bg-[#141c28] px-4 py-6 text-center text-sm text-sidebar-muted">
                        Drop rooms here
                      </p>
                    </div>
                  )}
                  <ul className="space-y-2.5 p-3">
                    {col.map((a) => {
                      const full = roomById[a.roomId];
                      if (!full) return null;
                      return (
                        <li key={a.id}>
                          <BoardRoomCard
                            room={full}
                            draggable
                            dragging={draggingRoomId === full.id}
                            onOpen={() => setPanelRoomId(full.id)}
                            isRestant={restantByRoomId.has(full.id)}
                            overdueDays={
                              overdueByRoomId.get(full.id) ??
                              restantByRoomId.get(full.id)?.overdueDays
                            }
                            onPointerDownDrag={(e, room) =>
                              startRoomDrag(e, room, {
                                isRestant: restantByRoomId.has(room.id),
                                overdueDays:
                                  overdueByRoomId.get(room.id) ??
                                  restantByRoomId.get(room.id)?.overdueDays,
                              })
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                  {publics.length > 0 && (
                    <div className="space-y-2 border-t border-white/10 bg-black/20 px-3 pb-3 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
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
                </div>
              );
            })}
          </div>
      </AppPageBody>

      {drag?.active && (
        <div
          className="pointer-events-none fixed z-[100] will-change-transform"
          style={{
            left: 0,
            top: 0,
            transform: `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0) rotate(2deg) scale(1.04)`,
            transition: 'none',
          }}
        >
          <BoardRoomCard
            room={drag.room}
            ghost
            tileKind={drag.tileKind}
            isRestant={drag.isRestant}
            overdueDays={drag.overdueDays}
          />
        </div>
      )}

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
