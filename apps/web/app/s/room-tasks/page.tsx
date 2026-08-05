'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

type RoomTypeRow = {
  id: string;
  name: string;
  code: string;
  roomCount: number;
};

/** Draft row: `id` only when persisted on the server. */
type DraftTask = {
  id?: string;
  label: string;
  code: string;
  sortOrder: number;
  required: boolean;
};

type ChecklistPayload = {
  roomType: { id: string; name: string; code: string };
  template: { id: string; name: string; version: number };
  tasks: Array<DraftTask & { id: string }>;
};

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export default function SupervisorRoomTasksPage() {
  const qc = useQueryClient();
  const { enterMobile } = useSupervisorMobileMode();
  const [roomTypeId, setRoomTypeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask[]>([]);

  const { data: roomTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: ['room-types'],
    queryFn: () => api<RoomTypeRow[]>('/room-types'),
  });

  useEffect(() => {
    if (roomTypes.length && !roomTypeId) {
      setRoomTypeId(roomTypes[0].id);
    }
  }, [roomTypes, roomTypeId]);

  const { data: payload, isLoading: loadingTpl } = useQuery({
    queryKey: ['room-types', roomTypeId, 'checklist-template'],
    queryFn: () => api<ChecklistPayload>(`/room-types/${roomTypeId}/checklist-template`),
    enabled: !!roomTypeId,
  });

  useEffect(() => {
    if (!payload?.tasks) return;
    setDraft(payload.tasks.map((t) => ({ ...t })));
  }, [roomTypeId, payload?.template?.id, payload?.template?.version]);

  const sortedDraft = useMemo(
    () => [...draft].sort((a, b) => a.sortOrder - b.sortOrder),
    [draft],
  );

  const save = useMutation({
    mutationFn: (tasks: DraftTask[]) => {
      if (!roomTypeId) throw new Error('No room type');
      const withOrder = tasks.map((t, i) => {
        const base = {
          label: t.label,
          code: t.code,
          sortOrder: i,
          required: t.required,
        };
        return t.id ? { id: t.id, ...base } : base;
      });
      return api<ChecklistPayload>(`/room-types/${roomTypeId}/checklist-template`, {
        method: 'PUT',
        body: JSON.stringify({ tasks: withOrder }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-types', roomTypeId, 'checklist-template'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  const dirty =
    payload &&
    JSON.stringify(
      sortedDraft.map((t, i) => ({
        id: t.id ?? null,
        label: t.label,
        code: t.code,
        sortOrder: i,
        required: t.required,
      })),
    ) !==
      JSON.stringify(
        [...payload.tasks]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((t, i) => ({
            id: t.id,
            label: t.label,
            code: t.code,
            sortOrder: i,
            required: t.required,
          })),
      );

  const move = (index: number, dir: -1 | 1) => {
    const ordered = [...sortedDraft];
    const to = index + dir;
    if (to < 0 || to >= ordered.length) return;
    const reordered = reorder(ordered, index, to);
    setDraft(
      reordered.map((t, i) => ({
        ...t,
        sortOrder: i,
      })),
    );
  };

  const addTask = () => {
    setDraft([
      ...sortedDraft,
      {
        label: 'New task',
        code: `task_${Date.now()}`,
        sortOrder: sortedDraft.length,
        required: true,
      },
    ]);
  };

  const removeAt = (index: number) => {
    const ordered = [...sortedDraft];
    ordered.splice(index, 1);
    setDraft(
      ordered.map((t, i) => ({
        ...t,
        sortOrder: i,
      })),
    );
  };

  const updateAt = (index: number, patch: Partial<DraftTask>) => {
    const ordered = [...sortedDraft];
    const row = ordered[index];
    if (!row) return;
    const next = { ...row, ...patch };
    if (patch.code != null) {
      next.code = patch.code.replace(/\s+/g, '_').toLowerCase();
    }
    ordered[index] = next;
    setDraft(ordered);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Room task lists"
        description="Edit the housekeeping checklist for each room type. Supervisors use this for inspections; attendants only mark rooms clean."
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />

      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
          {loadingTypes && <p className="text-sm text-sidebar-muted">Loading room types…</p>}

          {!loadingTypes && roomTypes.length === 0 && (
            <p className="text-sm text-sidebar-muted">No room types yet. Add room types in admin or seed data.</p>
          )}

          {roomTypes.length > 0 && (
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <label className="flex min-w-[200px] flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-sidebar-muted">Room type</span>
                <select
                  className={APP_DARK_INPUT + ' min-h-[48px]'}
                  value={roomTypeId ?? ''}
                  onChange={(e) => setRoomTypeId(e.target.value)}
                >
                  {roomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name} ({rt.code}) · {rt.roomCount} rooms
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {roomTypeId && loadingTpl && <p className="text-sm text-sidebar-muted">Loading checklist…</p>}

          {payload && (
            <div className={APP_DARK_CARD + ' space-y-4 p-5'}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    {payload.roomType.name} ({payload.roomType.code})
                  </p>
                  <p className="text-xs text-sidebar-muted">Template v{payload.template.version}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-[44px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
                    onClick={addTask}
                  >
                    Add task
                  </Button>
                  <Button
                    type="button"
                    variant="action"
                    className="min-h-[44px]"
                    disabled={!dirty || save.isPending || sortedDraft.length === 0}
                    onClick={() => save.mutate(sortedDraft)}
                  >
                    {save.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-sidebar-muted">
                Use a short internal code (e.g. <code className="rounded bg-black/30 px-1">towels</code>) — it must stay
                unique per room type. Changing codes may affect service-request links that reference them.
              </p>

              {save.isError && (
                <p className="text-sm text-red-400">Could not save. Check codes are unique and valid (letters, numbers, hyphens).</p>
              )}

              <ul className="space-y-3">
                {sortedDraft.map((t, index) => (
                  <li
                    key={t.id ?? `draft-${t.code}-${index}`}
                    className="rounded-card border border-sidebar-border/60 bg-black/15 p-3 sm:p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-sidebar-muted">Task label</span>
                          <input
                            className={APP_DARK_INPUT + ' min-h-[44px]'}
                            value={t.label}
                            onChange={(e) => updateAt(index, { label: e.target.value })}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-sidebar-muted">Code</span>
                          <input
                            className={APP_DARK_INPUT + ' min-h-[44px] font-mono'}
                            value={t.code}
                            onChange={(e) => updateAt(index, { code: e.target.value })}
                          />
                        </label>
                      </div>
                      <label className="flex items-center gap-2 sm:pt-6">
                        <input
                          type="checkbox"
                          checked={t.required}
                          onChange={(e) => updateAt(index, { required: e.target.checked })}
                          className="h-4 w-4 rounded border-sidebar-border"
                        />
                        <span className="text-sm text-white">Required</span>
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-[40px] min-w-[40px] px-2 text-sidebar-muted hover:bg-white/10 hover:text-white"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        aria-label="Move up"
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-[40px] min-w-[40px] px-2 text-sidebar-muted hover:bg-white/10 hover:text-white"
                        disabled={index === sortedDraft.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-[40px] text-red-400 hover:bg-red-500/10"
                        onClick={() => removeAt(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              {sortedDraft.length === 0 && (
                <p className="text-sm text-sidebar-muted">No tasks yet. Add at least one task before saving.</p>
              )}
            </div>
          )}
        </div>
      </AppPageBody>
    </div>
  );
}
