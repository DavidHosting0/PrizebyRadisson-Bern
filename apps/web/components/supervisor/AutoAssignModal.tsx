'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { DailyCleaningPlanResponse, DailyCleaningTaskDto } from '@housekeeping/shared';
import { formatFloorLabel } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

function formatFloorRange(floors: number[]): string {
  if (!floors.length) return '—';
  if (floors.length === 1) return formatFloorLabel(floors[0]);
  const sorted = [...floors].sort((a, b) => a - b);
  return `${formatFloorLabel(sorted[0])} – ${formatFloorLabel(sorted[sorted.length - 1])}`;
}

function TaskSection({
  title,
  tasks,
  assignees,
  onAssign,
  onSkip,
  skipping,
}: {
  title: string;
  tasks: DailyCleaningTaskDto[];
  assignees: DailyCleaningPlanResponse['manualAssignees'];
  onAssign: (taskId: string, assigneeUserId: string) => void;
  onSkip?: (roomId: string) => void;
  skipping?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">
        {title}{' '}
        <span className="font-normal text-ink-muted">({tasks.length})</span>
      </h3>
      {tasks.map((row) => (
        <Card key={row.id} className="flex flex-wrap items-center gap-3">
          <div className="min-w-[120px]">
            <p className="font-semibold text-ink">
              {row.kind === 'ROOM' ? `Room ${row.roomNumber}` : row.publicAreaName}
            </p>
            {row.floor != null && (
              <p className="text-xs text-ink-muted">{formatFloorLabel(row.floor)}</p>
            )}
            {row.overdueDays != null && row.overdueDays > 0 && (
              <p className="mt-1 text-xs font-semibold text-red-600">
                Overdue {row.overdueDays} day{row.overdueDays === 1 ? '' : 's'}
              </p>
            )}
            {row.pinned && <p className="text-xs text-ink-muted">Pinned</p>}
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">Assign to</span>
            <select
              className="min-h-[44px] flex-1 min-w-[180px] rounded-btn border border-border bg-surface px-3 py-2 text-sm"
              value={row.assigneeUserId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onAssign(row.id, v);
              }}
            >
              <option value="">— Unassigned —</option>
              {assignees.map((h) => (
                <option key={h.id} value={h.id}>
                  {formatUserWithTitlePrefix(h.name, h.titlePrefix)}
                  {h.isLateShift ? ' (late)' : ''}
                </option>
              ))}
            </select>
            {row.kind === 'ROOM' && row.roomId && onSkip && (
              <Button
                variant="ghost"
                className="min-h-[44px] text-xs"
                disabled={skipping}
                onClick={() => onSkip(row.roomId!)}
              >
                Skip → tomorrow
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function AutoAssignModal({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date?: string;
}) {
  const qc = useQueryClient();
  const dateParam = date?.trim() ? `?date=${encodeURIComponent(date.trim())}` : '';

  const planQ = useQuery({
    queryKey: ['assignments', 'daily-plan', date ?? 'today'],
    queryFn: () => api<DailyCleaningPlanResponse>(`/assignments/daily-plan${dateParam}`),
    enabled: open,
  });

  const [busy, setBusy] = useState(false);

  const plan = planQ.data;
  const dirty = useMemo(
    () => (plan?.tasks ?? []).filter((t) => t.workType === 'DIRTY'),
    [plan],
  );
  const restants = useMemo(
    () => (plan?.tasks ?? []).filter((t) => t.workType === 'RESTANT'),
    [plan],
  );
  const publics = useMemo(
    () => (plan?.tasks ?? []).filter((t) => t.workType === 'PUBLIC'),
    [plan],
  );

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['assignments'] });
    await qc.invalidateQueries({ queryKey: ['rooms'] });
    await qc.invalidateQueries({ queryKey: ['departures'] });
  };

  const suggest = useMutation({
    mutationFn: () =>
      api<DailyCleaningPlanResponse>(`/assignments/daily-plan/suggest${dateParam}`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      qc.setQueryData(['assignments', 'daily-plan', date ?? 'today'], data);
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api<DailyCleaningPlanResponse>(`/assignments/daily-plan/save${dateParam}`, {
        method: 'POST',
      }),
    onSuccess: async (data) => {
      qc.setQueryData(['assignments', 'daily-plan', date ?? 'today'], data);
      await invalidate();
      onClose();
    },
  });

  async function assign(taskId: string, assigneeUserId: string) {
    setBusy(true);
    try {
      const data = await api<DailyCleaningPlanResponse>(
        `/assignments/daily-plan/tasks/${taskId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ assigneeUserId, pinned: true }),
        },
      );
      qc.setQueryData(['assignments', 'daily-plan', date ?? 'today'], data);
      await invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function skip(roomId: string) {
    setBusy(true);
    try {
      const data = await api<DailyCleaningPlanResponse>(`/assignments/daily-plan/skip`, {
        method: 'POST',
        body: JSON.stringify({ roomId, date: date?.trim() || undefined }),
      });
      qc.setQueryData(['assignments', 'daily-plan', date ?? 'today'], data);
      await invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function toggleLate(userId: string, isLateShift: boolean) {
    setBusy(true);
    try {
      const data = await api<DailyCleaningPlanResponse>(`/assignments/daily-plan/late-shift`, {
        method: 'PATCH',
        body: JSON.stringify({ userId, isLateShift, date: date?.trim() || undefined }),
      });
      qc.setQueryData(['assignments', 'daily-plan', date ?? 'today'], data);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const canSave = Boolean(plan?.suggested || plan?.tasks.some((t) => t.assigneeUserId));
  const assignees = plan?.manualAssignees ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card border border-border bg-surface shadow-lift"
        role="dialog"
        aria-labelledby="auto-assign-title"
      >
        <div className="border-b border-border px-6 py-4">
          <h2 id="auto-assign-title" className="text-lg font-semibold text-ink">
            Daily cleaning assignment
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Run a suggestion, adjust pins, then save for the day.
            {date ? ` Date: ${date}.` : ''}
            {plan?.status === 'SAVED' && plan.savedAt
              ? ` Saved ${new Date(plan.savedAt).toLocaleString()}.`
              : ' Not saved yet — rooms stay unassigned until you save.'}
          </p>
        </div>
        <div className="space-y-4 p-6">
          {planQ.isLoading && <p className="text-sm text-ink-muted">Loading plan…</p>}
          {planQ.error && (
            <p className="text-sm text-red-600">Could not load daily plan.</p>
          )}

          {plan?.warnings?.map((w) => (
            <p key={w} className="rounded-btn border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {w}
            </p>
          ))}

          {plan && plan.eligibleCleaners.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Cleaners on shift</h3>
              <div className="flex flex-wrap gap-2">
                {plan.eligibleCleaners.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleLate(c.id, !c.isLateShift)}
                    className={`rounded-btn border px-3 py-1.5 text-sm ${
                      c.isLateShift
                        ? 'border-amber-400 bg-amber-50 text-amber-950'
                        : 'border-border bg-surface text-ink'
                    }`}
                    title="Click to toggle late shift"
                  >
                    {formatUserWithTitlePrefix(c.name, c.titlePrefix)}
                    {c.isLateShift ? ' · late' : ''}
                    {c.lateShiftSource === 'override' ? ' *' : ''}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Click a name to correct late-shift detection (11–20). * = supervisor override.
              </p>
            </div>
          )}

          {plan && plan.summaries.some((s) => s.roomCount + s.restantCount + s.publicCount > 0) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {plan.summaries
                .filter((s) => s.roomCount + s.restantCount + s.publicCount > 0)
                .map((s) => {
                  const hk = assignees.find((a) => a.id === s.housekeeperId);
                  return (
                    <Card key={s.housekeeperId} className="text-sm">
                      <p className="font-semibold text-ink">
                        {hk
                          ? formatUserWithTitlePrefix(hk.name, hk.titlePrefix)
                          : s.housekeeperId}
                      </p>
                      <p className="mt-1 text-ink-muted">
                        {s.roomCount} dirty · {s.restantCount} restant · {s.publicCount} public
                        {s.floors.length > 0 ? ` · ${formatFloorRange(s.floors)}` : ''}
                      </p>
                    </Card>
                  );
                })}
            </div>
          )}

          <TaskSection
            title="Dirty rooms"
            tasks={dirty}
            assignees={assignees}
            onAssign={assign}
            onSkip={skip}
            skipping={busy}
          />
          <TaskSection
            title="Restants"
            tasks={restants}
            assignees={assignees}
            onAssign={assign}
            onSkip={skip}
            skipping={busy}
          />
          <TaskSection
            title="Public areas"
            tasks={publics}
            assignees={assignees}
            onAssign={assign}
          />

          {plan && plan.tasks.length === 0 && (
            <p className="text-sm text-ink-muted">No dirty rooms or due public areas for this day.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 border-t border-border bg-surface-muted/50 px-6 py-4">
          <Button
            variant="secondary"
            className="min-h-[48px]"
            disabled={suggest.isPending || busy}
            onClick={() => suggest.mutate()}
          >
            {suggest.isPending ? 'Running…' : 'Run suggestion'}
          </Button>
          <Button
            variant="action"
            className="min-h-[48px]"
            disabled={save.isPending || busy || !canSave}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save for today'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
