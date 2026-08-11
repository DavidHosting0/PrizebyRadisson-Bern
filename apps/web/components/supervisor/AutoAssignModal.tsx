'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DailyCleaningPlanResponse } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { Button } from '@/components/ui/Button';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';

type Assignee = DailyCleaningPlanResponse['manualAssignees'][number];

type Tone = 'action' | 'amber' | 'emerald';

const TONE_ACTIVE: Record<Tone, string> = {
  action: 'border-action/50 bg-action/15 text-white',
  amber: 'border-amber-400/40 bg-amber-400/15 text-amber-50',
  emerald: 'border-emerald-400/40 bg-emerald-400/15 text-emerald-50',
};

const TONE_CHECK: Record<Tone, string> = {
  action: 'border-action bg-action text-white',
  amber: 'border-amber-400 bg-amber-400 text-amber-950',
  emerald: 'border-emerald-400 bg-emerald-400 text-emerald-950',
};

function PersonPickRow({
  label,
  selected,
  onToggle,
  tone = 'action',
  badges,
  hint,
  mode = 'multi',
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
  tone?: Tone;
  badges?: string[];
  hint?: string;
  mode?: 'multi' | 'single';
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={clsx(
        'flex w-full items-center gap-3 rounded-btn border px-3 py-2.5 text-left transition',
        selected
          ? TONE_ACTIVE[tone]
          : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10',
      )}
    >
      <span
        className={clsx(
          'flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] font-bold',
          mode === 'single' ? 'rounded-full' : 'rounded-[5px]',
          selected ? TONE_CHECK[tone] : 'border-white/25 bg-transparent text-transparent',
        )}
        aria-hidden
      >
        {mode === 'single' ? '•' : '✓'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-sidebar-muted">{hint}</span> : null}
      </span>
      {badges && badges.length > 0 ? (
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {badges.map((b) => (
            <span
              key={b}
              className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted"
            >
              {b}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

function Section({
  title,
  description,
  count,
  actions,
  children,
}: {
  title: string;
  description?: string;
  count?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-sidebar-border/60 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">{title}</h3>
            {count ? (
              <span className="rounded border border-sidebar-border/80 bg-sidebar px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-200">
                {count}
              </span>
            ) : null}
          </div>
          {description ? <p className="mt-1 text-xs text-sidebar-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-1.5">{actions}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function QuickLink({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-btn border border-sidebar-border/80 bg-sidebar-hover/40 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

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
  const allCleaners = planQ.data?.allCleaners ?? [];
  const inspectorCandidates = planQ.data?.inspectorCandidates ?? [];
  const workPreview = planQ.data?.workPreview;

  const [workingIds, setWorkingIds] = useState<string[]>([]);
  const [restantId, setRestantId] = useState('');
  const [lateIds, setLateIds] = useState<string[]>([]);
  const [publicIds, setPublicIds] = useState<string[]>([]);
  const [inspectorIds, setInspectorIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !planQ.data) return;
    const working = planQ.data.workingToday.map((c) => c.id);
    setWorkingIds(working);
    const autoLate = planQ.data.workingToday.filter((c) => c.isLateShift).map((c) => c.id);
    setLateIds(autoLate);
    const restantTask = planQ.data.tasks.find((t) => t.workType === 'RESTANT' && t.assigneeUserId);
    if (restantTask?.assigneeUserId) setRestantId(restantTask.assigneeUserId);
    else setRestantId('');
    const publicAssignees = [
      ...new Set(
        planQ.data.tasks
          .filter((t) => t.workType === 'PUBLIC' && t.assigneeUserId)
          .map((t) => t.assigneeUserId!),
      ),
    ];
    if (publicAssignees.length) setPublicIds(publicAssignees);
    else if (autoLate.length) setPublicIds(autoLate);
    else setPublicIds([]);
    setInspectorIds(planQ.data.inspectorsToday?.map((i) => i.id) ?? []);
  }, [open, planQ.data]);

  const workingSet = useMemo(() => new Set(workingIds), [workingIds]);

  const lateOptions = useMemo(
    () => allCleaners.filter((c) => workingSet.has(c.id)),
    [allCleaners, workingSet],
  );

  const restantOptions = useMemo(() => {
    const map = new Map<string, Assignee>();
    for (const a of assignees) map.set(a.id, a);
    return [...map.values()];
  }, [assignees]);

  const onShiftIds = useMemo(
    () => new Set(planQ.data?.onShiftCleaners.map((c) => c.id) ?? []),
    [planQ.data?.onShiftCleaners],
  );

  const onShiftCleaners = planQ.data?.onShiftCleaners ?? [];

  const run = useMutation({
    mutationFn: () =>
      api<DailyCleaningPlanResponse>('/assignments/daily-plan/run', {
        method: 'POST',
        body: JSON.stringify({
          date: date?.trim() || undefined,
          workingTodayUserIds: workingIds,
          restantAssigneeUserId: restantId || null,
          lateShiftUserIds: lateIds.filter((id) => workingSet.has(id)),
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

  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({ open, onClose, containerRef: panelRef });

  function toggleId(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function setWorking(next: string[]) {
    const nextSet = new Set(next);
    setWorkingIds(next);
    setLateIds((late) => late.filter((x) => nextSet.has(x)));
  }

  function toggleWorking(id: string) {
    setWorking(workingIds.includes(id) ? workingIds.filter((x) => x !== id) : [...workingIds, id]);
  }

  if (!open) return null;

  const canRun = !run.isPending && !planQ.isLoading && workingIds.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={clsx(
          APP_DARK_CARD,
          'flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-card shadow-lift sm:rounded-card',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-assign-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sidebar-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 id="auto-assign-setup-title" className="text-lg font-semibold tracking-tight text-white">
              Auto room assignment
            </h2>
            <p className="mt-1 text-sm text-sidebar-muted">
              Set today’s crew, then run to distribute dirty rooms on the board.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-sidebar-muted transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
            onClick={onClose}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="sidebar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {planQ.isLoading && <p className="text-sm text-sidebar-muted">Loading staff…</p>}

          {workPreview && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Dirty rooms', value: workPreview.dirtyRoomCount },
                { label: 'Restants', value: workPreview.restantCount },
                { label: 'Public', value: workPreview.publicCount },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-btn border border-sidebar-border/60 bg-sidebar/60 px-3 py-2.5 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {planQ.data?.warnings?.map((w) => (
            <p
              key={w}
              className="rounded-btn border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
            >
              {w}
            </p>
          ))}

          <Section
            title="Who works today"
            description="Cleaners and HSK supervisors. Shift-plan staff are pre-selected."
            count={`${workingIds.length} selected`}
            actions={
              <>
                <QuickLink
                  label="On shift"
                  disabled={onShiftCleaners.length === 0}
                  onClick={() => setWorking(onShiftCleaners.map((c) => c.id))}
                />
                <QuickLink
                  label="All"
                  disabled={allCleaners.length === 0}
                  onClick={() => setWorking(allCleaners.map((c) => c.id))}
                />
                <QuickLink
                  label="Clear"
                  disabled={workingIds.length === 0}
                  onClick={() => setWorking([])}
                />
              </>
            }
          >
            {allCleaners.length === 0 ? (
              <p className="text-sm text-sidebar-muted">No active cleaners or supervisors found.</p>
            ) : (
              <div className="grid max-h-56 gap-1.5 overflow-y-auto sidebar-scroll sm:grid-cols-2">
                {allCleaners.map((c) => {
                  const isSupervisor =
                    c.role === 'SUPERVISOR' || c.titlePrefix === 'HOUSEKEEPING_SUPERVISOR';
                  const badges = [
                    ...(onShiftIds.has(c.id) ? ['shift'] : []),
                    ...(isSupervisor ? ['supervisor'] : []),
                  ];
                  return (
                    <PersonPickRow
                      key={c.id}
                      label={formatUserWithTitlePrefix(c.name, c.titlePrefix)}
                      selected={workingSet.has(c.id)}
                      onToggle={() => toggleWorking(c.id)}
                      badges={badges.length ? badges : undefined}
                    />
                  );
                })}
              </div>
            )}
          </Section>

          <Section
            title="Restant cleaning"
            description="Who handles restant rooms. Leave on auto to let the system pick."
          >
            <select
              className={clsx(APP_DARK_INPUT, 'min-h-[44px] w-full')}
              value={restantId}
              onChange={(e) => setRestantId(e.target.value)}
            >
              <option value="">Auto-pick one cleaner</option>
              {restantOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatUserWithTitlePrefix(a.name, a.titlePrefix)}
                  {a.role === 'SUPERVISOR' ? ' (supervisor)' : ''}
                </option>
              ))}
            </select>
          </Section>

          <Section
            title="Late shift (11–20)"
            description="Late-shift cleaners get fewer rooms."
            count={`${lateIds.filter((id) => workingSet.has(id)).length} selected`}
            actions={
              lateOptions.length > 0 ? (
                <>
                  <QuickLink
                    label="All working"
                    onClick={() => setLateIds(lateOptions.map((c) => c.id))}
                  />
                  <QuickLink
                    label="Clear"
                    disabled={lateIds.length === 0}
                    onClick={() => setLateIds([])}
                  />
                </>
              ) : null
            }
          >
            {lateOptions.length === 0 ? (
              <p className="text-sm text-sidebar-muted">Select who works today first.</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {lateOptions.map((c) => (
                  <PersonPickRow
                    key={c.id}
                    label={formatUserWithTitlePrefix(c.name, c.titlePrefix)}
                    selected={lateIds.includes(c.id)}
                    onToggle={() => toggleId(lateIds, c.id, setLateIds)}
                    tone="amber"
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Public cleaning"
            description="Assign public-area tasks for today."
            count={`${publicIds.length} selected`}
            actions={
              restantOptions.length > 0 ? (
                <>
                  {lateIds.length > 0 ? (
                    <QuickLink
                      label="Use late shift"
                      onClick={() => setPublicIds(lateIds.filter((id) => workingSet.has(id)))}
                    />
                  ) : null}
                  <QuickLink
                    label="Clear"
                    disabled={publicIds.length === 0}
                    onClick={() => setPublicIds([])}
                  />
                </>
              ) : null
            }
          >
            {restantOptions.length === 0 ? (
              <p className="text-sm text-sidebar-muted">No assignees available.</p>
            ) : (
              <div className="grid max-h-48 gap-1.5 overflow-y-auto sidebar-scroll sm:grid-cols-2">
                {restantOptions.map((a) => (
                  <PersonPickRow
                    key={a.id}
                    label={formatUserWithTitlePrefix(a.name, a.titlePrefix)}
                    selected={publicIds.includes(a.id)}
                    onToggle={() => toggleId(publicIds, a.id, setPublicIds)}
                    badges={a.role === 'SUPERVISOR' ? ['supervisor'] : undefined}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Who inspects today"
            description="Cleaners and housekeeping supervisors only (not HTC). They share the inspection queue."
            count={`${inspectorIds.length} selected`}
            actions={
              inspectorCandidates.length > 0 ? (
                <>
                  <QuickLink
                    label="All"
                    onClick={() => setInspectorIds(inspectorCandidates.map((c) => c.id))}
                  />
                  <QuickLink
                    label="Clear"
                    disabled={inspectorIds.length === 0}
                    onClick={() => setInspectorIds([])}
                  />
                </>
              ) : null
            }
          >
            {inspectorCandidates.length === 0 ? (
              <p className="text-sm text-sidebar-muted">No eligible inspectors.</p>
            ) : (
              <div className="grid max-h-48 gap-1.5 overflow-y-auto sidebar-scroll sm:grid-cols-2">
                {inspectorCandidates.map((c) => (
                  <PersonPickRow
                    key={c.id}
                    label={formatUserWithTitlePrefix(c.name, c.titlePrefix)}
                    selected={inspectorIds.includes(c.id)}
                    onToggle={() => toggleId(inspectorIds, c.id, setInspectorIds)}
                    tone="emerald"
                  />
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-sidebar-border/60 bg-sidebar-hover/30 px-5 py-4">
          <Button
            variant="action"
            className="min-h-[44px] flex-1 sm:flex-none"
            disabled={!canRun}
            onClick={() => run.mutate()}
          >
            {run.isPending ? 'Assigning…' : 'Run auto assignment'}
          </Button>
          <Button
            variant="secondary"
            className="min-h-[44px] border-sidebar-border bg-transparent text-white hover:bg-white/10"
            onClick={onClose}
          >
            Cancel
          </Button>
          {workingIds.length === 0 && !planQ.isLoading ? (
            <p className="w-full text-xs text-sidebar-muted sm:w-auto">
              Select at least one cleaner to run.
            </p>
          ) : null}
          {run.isError && (
            <p className="w-full text-sm text-rose-400">
              {(run.error as Error)?.message || 'Could not run auto assignment.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
