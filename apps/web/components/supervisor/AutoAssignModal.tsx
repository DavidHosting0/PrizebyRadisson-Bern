'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { DailyCleaningPlanResponse } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { Button } from '@/components/ui/Button';

type Assignee = DailyCleaningPlanResponse['manualAssignees'][number];

export function AutoAssignSetupModal({
  open,
  onClose,
  date,
  onRan,
}: {
  open: boolean;
  onClose: () => void;
  date?: string;
  onRan?: () => void;
}) {
  const qc = useQueryClient();
  const dateParam = date?.trim() ? `?date=${encodeURIComponent(date.trim())}` : '';

  const planQ = useQuery({
    queryKey: ['assignments', 'daily-plan', date ?? 'today'],
    queryFn: () => api<DailyCleaningPlanResponse>(`/assignments/daily-plan${dateParam}`),
    enabled: open,
  });

  const assignees = planQ.data?.manualAssignees ?? [];
  const eligible = planQ.data?.eligibleCleaners ?? [];
  const inspectorCandidates = planQ.data?.inspectorCandidates ?? [];

  const [restantId, setRestantId] = useState('');
  const [lateIds, setLateIds] = useState<string[]>([]);
  const [publicIds, setPublicIds] = useState<string[]>([]);
  const [inspectorIds, setInspectorIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !planQ.data) return;
    const autoLate = planQ.data.eligibleCleaners.filter((c) => c.isLateShift).map((c) => c.id);
    setLateIds(autoLate);
    const restantTask = planQ.data.tasks.find((t) => t.workType === 'RESTANT' && t.assigneeUserId);
    if (restantTask?.assigneeUserId) setRestantId(restantTask.assigneeUserId);
    const publicAssignees = [
      ...new Set(
        planQ.data.tasks
          .filter((t) => t.workType === 'PUBLIC' && t.assigneeUserId)
          .map((t) => t.assigneeUserId!),
      ),
    ];
    if (publicAssignees.length) setPublicIds(publicAssignees);
    else if (autoLate.length) setPublicIds(autoLate);
    setInspectorIds(planQ.data.inspectorsToday?.map((i) => i.id) ?? []);
  }, [open, planQ.data]);

  const restantOptions = useMemo(() => {
    const map = new Map<string, Assignee>();
    for (const a of assignees) map.set(a.id, a);
    return [...map.values()];
  }, [assignees]);

  const run = useMutation({
    mutationFn: () =>
      api<DailyCleaningPlanResponse>('/assignments/daily-plan/run', {
        method: 'POST',
        body: JSON.stringify({
          date: date?.trim() || undefined,
          restantAssigneeUserId: restantId || null,
          lateShiftUserIds: lateIds,
          publicAssigneeUserIds: publicIds,
          inspectorUserIds: inspectorIds,
        }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['assignments'] });
      await qc.invalidateQueries({ queryKey: ['rooms'] });
      onRan?.();
      onClose();
    },
  });

  function toggleId(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-border bg-surface shadow-lift"
        role="dialog"
        aria-labelledby="auto-assign-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h2 id="auto-assign-setup-title" className="text-lg font-semibold text-ink">
              Auto room assignment
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Choose restant, late shift, public cleaning, and who inspects today — then the system
              assigns dirty rooms on the board.
            </p>
          </div>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] rounded-btn text-xl text-ink-muted hover:bg-surface-muted"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="space-y-5 p-6">
          {planQ.isLoading && <p className="text-sm text-ink-muted">Loading staff…</p>}
          {planQ.data?.warnings?.map((w) => (
            <p
              key={w}
              className="rounded-btn border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              {w}
            </p>
          ))}

          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Restant cleaning
            </span>
            <select
              className="min-h-[44px] w-full rounded-btn border border-border bg-surface px-3 text-sm"
              value={restantId}
              onChange={(e) => setRestantId(e.target.value)}
            >
              <option value="">— Auto-pick one cleaner —</option>
              {restantOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatUserWithTitlePrefix(a.name, a.titlePrefix)}
                  {a.role === 'SUPERVISOR' ? ' (supervisor)' : ''}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Late shift (11–20) — fewer rooms
            </legend>
            {eligible.length === 0 && (
              <p className="text-sm text-ink-muted">No cleaners on shift for this day.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {eligible.map((c) => {
                const on = lateIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleId(lateIds, c.id, setLateIds)}
                    className={`rounded-btn border px-3 py-2 text-sm ${
                      on
                        ? 'border-amber-400 bg-amber-50 text-amber-950'
                        : 'border-border bg-surface text-ink'
                    }`}
                  >
                    {formatUserWithTitlePrefix(c.name, c.titlePrefix)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Public cleaning
            </legend>
            <div className="flex flex-wrap gap-2">
              {restantOptions.map((a) => {
                const on = publicIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleId(publicIds, a.id, setPublicIds)}
                    className={`rounded-btn border px-3 py-2 text-sm ${
                      on
                        ? 'border-action/40 bg-action/10 text-ink'
                        : 'border-border bg-surface text-ink'
                    }`}
                  >
                    {formatUserWithTitlePrefix(a.name, a.titlePrefix)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Who inspects today
            </legend>
            <p className="text-xs text-ink-muted">
              Cleaners and housekeeping supervisors only (not HTC). Selected staff share the
              inspection queue after rooms are marked clean.
            </p>
            {inspectorCandidates.length === 0 && (
              <p className="text-sm text-ink-muted">No eligible inspectors.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {inspectorCandidates.map((c) => {
                const on = inspectorIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleId(inspectorIds, c.id, setInspectorIds)}
                    className={`rounded-btn border px-3 py-2 text-sm ${
                      on
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-950'
                        : 'border-border bg-surface text-ink'
                    }`}
                  >
                    {formatUserWithTitlePrefix(c.name, c.titlePrefix)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-border bg-surface-muted/50 px-6 py-4">
          <Button
            variant="action"
            className="min-h-[48px]"
            disabled={run.isPending || planQ.isLoading}
            onClick={() => run.mutate()}
          >
            {run.isPending ? 'Assigning…' : 'Run auto assignment'}
          </Button>
          <Button variant="ghost" className="min-h-[48px]" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
