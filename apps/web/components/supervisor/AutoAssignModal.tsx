'use client';

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AutoAssignPreviewPerson,
  AutoAssignPreviewResponse,
  DailyCleaningPlanResponse,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { useTranslations } from 'next-intl';

type Assignee = DailyCleaningPlanResponse['manualAssignees'][number];

const LATE_ROOM_WEIGHT = 0.55;
const RESTANT_DIRTY_FACTOR = 1.35;

function personRoomWeight(p: AutoAssignPreviewPerson, totalRestant: number): number {
  let w = p.isLateShift ? LATE_ROOM_WEIGHT : 1;
  if (p.restantCount > 0 && totalRestant > 0) {
    w *= 1 + (p.restantCount / totalRestant) * (RESTANT_DIRTY_FACTOR - 1);
  }
  return w;
}

/** Move exactly one dirty room to/from `userId` using auto-assign weights. */
function shiftOneDirtyRoom(
  people: AutoAssignPreviewPerson[],
  userId: string,
  delta: number,
): Record<string, number> | null {
  const counts: Record<string, number> = {};
  for (const p of people) counts[p.userId] = p.dirtyRoomCount;
  const current = counts[userId];
  if (current == null) return null;
  if (delta > 0 && current + delta > people.reduce((s, p) => s + p.dirtyRoomCount, 0)) return null;
  if (delta < 0 && current <= 0) return null;

  const totalRestant = people.reduce((s, p) => s + p.restantCount, 0);
  const total = people.reduce((s, p) => s + p.dirtyRoomCount, 0);
  const weights = new Map(people.map((p) => [p.userId, personRoomWeight(p, totalRestant)]));
  const weightSum = [...weights.values()].reduce((a, b) => a + b, 0) || people.length;
  const fair: Record<string, number> = {};
  for (const p of people) {
    fair[p.userId] = ((weights.get(p.userId) ?? 0) * total) / weightSum;
  }

  const others = people.filter((p) => p.userId !== userId);
  if (others.length === 0) return null;

  if (delta > 0) {
    const donors = others.filter((p) => (counts[p.userId] ?? 0) > 0);
    if (donors.length === 0) return null;
    donors.sort((a, b) => {
      const da = (counts[a.userId] ?? 0) - (fair[a.userId] ?? 0);
      const db = (counts[b.userId] ?? 0) - (fair[b.userId] ?? 0);
      if (db !== da) return db - da;
      return a.userId.localeCompare(b.userId);
    });
    const donor = donors[0]!;
    counts[userId] = current + 1;
    counts[donor.userId] = (counts[donor.userId] ?? 0) - 1;
  } else {
    others.sort((a, b) => {
      const da = (counts[a.userId] ?? 0) - (fair[a.userId] ?? 0);
      const db = (counts[b.userId] ?? 0) - (fair[b.userId] ?? 0);
      if (da !== db) return da - db;
      return a.userId.localeCompare(b.userId);
    });
    const receiver = others[0]!;
    counts[userId] = current - 1;
    counts[receiver.userId] = (counts[receiver.userId] ?? 0) + 1;
  }
  return counts;
}

function assignmentsFromPeople(people: AutoAssignPreviewPerson[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const p of people) {
    for (const room of p.rooms) next[room.roomId] = p.userId;
  }
  return next;
}

function countsFromAssignments(
  assignments: Record<string, string>,
  userIds: string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of userIds) counts[id] = 0;
  for (const userId of Object.values(assignments)) {
    counts[userId] = (counts[userId] ?? 0) + 1;
  }
  return counts;
}

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
  const t = useTranslations('supervisor.autoAssignModal');
  const tCommon = useTranslations('common');
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
  const [restantIds, setRestantIds] = useState<string[]>([]);
  const [lateIds, setLateIds] = useState<string[]>([]);
  const [publicIds, setPublicIds] = useState<string[]>([]);
  const [inspectorIds, setInspectorIds] = useState<string[]>([]);
  const [lockedTargets, setLockedTargets] = useState<Record<string, number>>({});
  const [roomAssignments, setRoomAssignments] = useState<Record<string, string> | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [dragOverUserId, setDragOverUserId] = useState<string | null>(null);
  const crewHydrated = useRef(false);

  useEffect(() => {
    if (!open) {
      crewHydrated.current = false;
      return;
    }
    if (!planQ.data || crewHydrated.current) return;
    crewHydrated.current = true;
    const working = planQ.data.workingToday.map((c) => c.id);
    setWorkingIds(working);
    const autoLate = planQ.data.workingToday.filter((c) => c.isLateShift).map((c) => c.id);
    setLateIds(autoLate);
    const restantAssignees = [
      ...new Set(
        planQ.data.tasks
          .filter((t) => t.workType === 'RESTANT' && t.assigneeUserId)
          .map((t) => t.assigneeUserId!),
      ),
    ];
    setRestantIds(restantAssignees);
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
    setLockedTargets({});
    setRoomAssignments(null);
    setSelectedRoomId(null);
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

  const crewKey = useMemo(
    () =>
      [
        workingIds.slice().sort().join(','),
        lateIds.filter((id) => workingSet.has(id)).slice().sort().join(','),
        restantIds.slice().sort().join(','),
        publicIds.slice().sort().join(','),
      ].join('|'),
    [workingIds, lateIds, restantIds, publicIds, workingSet],
  );

  useEffect(() => {
    setLockedTargets({});
    setRoomAssignments(null);
    setSelectedRoomId(null);
  }, [crewKey]);

  const previewPayload = useMemo(
    () => ({
      date: date?.trim() || undefined,
      workingTodayUserIds: workingIds,
      restantAssigneeUserIds: restantIds,
      lateShiftUserIds: lateIds.filter((id) => workingSet.has(id)),
      publicAssigneeUserIds: publicIds,
      dirtyRoomTargets:
        Object.keys(lockedTargets).length > 0
          ? Object.entries(lockedTargets).map(([userId, count]) => ({ userId, count }))
          : undefined,
      dirtyRoomAssignments: roomAssignments
        ? Object.entries(roomAssignments).map(([roomId, userId]) => ({ roomId, userId }))
        : undefined,
    }),
    [date, workingIds, restantIds, lateIds, publicIds, workingSet, lockedTargets, roomAssignments],
  );

  const previewQ = useQuery({
    queryKey: ['assignments', 'daily-plan', 'preview', previewPayload],
    queryFn: () =>
      api<AutoAssignPreviewResponse>('/assignments/daily-plan/preview', {
        method: 'POST',
        body: JSON.stringify(previewPayload),
      }),
    enabled: open && workingIds.length > 0,
    placeholderData: keepPreviousData,
  });

  const run = useMutation({
    mutationFn: () => {
      const previewPins =
        roomAssignments ??
        (previewQ.data ? assignmentsFromPeople(previewQ.data.people) : null);
      const countLocks =
        Object.keys(lockedTargets).length > 0
          ? lockedTargets
          : previewPins
            ? countsFromAssignments(previewPins, workingIds)
            : null;
      return api<DailyCleaningPlanResponse>('/assignments/daily-plan/run', {
        method: 'POST',
        body: JSON.stringify({
          date: date?.trim() || undefined,
          workingTodayUserIds: workingIds,
          restantAssigneeUserIds: restantIds,
          lateShiftUserIds: lateIds.filter((id) => workingSet.has(id)),
          publicAssigneeUserIds: publicIds,
          inspectorUserIds: inspectorIds,
          dirtyRoomTargets: countLocks
            ? Object.entries(countLocks).map(([userId, count]) => ({ userId, count }))
            : undefined,
          dirtyRoomAssignments: previewPins
            ? Object.entries(previewPins).map(([roomId, userId]) => ({ roomId, userId }))
            : undefined,
        }),
      });
    },
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

  function applyRoomAssignments(next: Record<string, string>) {
    setRoomAssignments(next);
    setLockedTargets(countsFromAssignments(next, workingIds));
    setSelectedRoomId(null);
    setDragOverUserId(null);
  }

  function moveRoomTo(roomId: string, toUserId: string) {
    if (!previewQ.data) return;
    const base = roomAssignments ?? assignmentsFromPeople(previewQ.data.people);
    if (base[roomId] === toUserId) {
      setSelectedRoomId(null);
      return;
    }
    applyRoomAssignments({ ...base, [roomId]: toUserId });
  }

  function adjustDirtyCount(userId: string, delta: number) {
    if (!previewQ.data || previewQ.isFetching) return;
    const people = previewQ.data.people;
    const next = shiftOneDirtyRoom(people, userId, delta);
    if (!next) return;
    if (roomAssignments) {
      const current = assignmentsFromPeople(people);
      const gainer = people.find((p) => (next[p.userId] ?? 0) > p.dirtyRoomCount);
      const loser = people.find((p) => (next[p.userId] ?? 0) < p.dirtyRoomCount);
      const moved = loser?.rooms[loser.rooms.length - 1];
      if (gainer && moved) {
        applyRoomAssignments({ ...current, [moved.roomId]: gainer.userId });
        return;
      }
    }
    setLockedTargets(next);
    setRoomAssignments(null);
  }

  if (!open) return null;

  const canRun = !run.isPending && !planQ.isLoading && workingIds.length > 0;
  const previewPeople = previewQ.data?.people ?? [];

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
          'flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card shadow-lift sm:rounded-card',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-assign-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sidebar-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 id="auto-assign-setup-title" className="text-lg font-semibold tracking-tight text-white">
              {t('title')}
            </h2>
            <p className="mt-1 text-sm text-sidebar-muted">
              {t('subtitle')}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-sidebar-muted transition hover:bg-white/10 hover:text-white"
            aria-label={tCommon('close')}
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
          {planQ.isLoading && <p className="text-sm text-sidebar-muted">{t('loadingStaff')}</p>}

          {workPreview && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: t('dirtyRooms'), value: workPreview.dirtyRoomCount },
                { label: t('restants'), value: workPreview.restantCount },
                { label: t('public'), value: workPreview.publicCount },
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
            title={t('whoWorksToday')}
            description={t('whoWorksTodayHint')}
            count={t('selectedCount', { count: workingIds.length })}
            actions={
              <>
                <QuickLink
                  label={t('onShift')}
                  disabled={onShiftCleaners.length === 0}
                  onClick={() => setWorking(onShiftCleaners.map((c) => c.id))}
                />
                <QuickLink
                  label={tCommon('all')}
                  disabled={allCleaners.length === 0}
                  onClick={() => setWorking(allCleaners.map((c) => c.id))}
                />
                <QuickLink
                  label={t('clear')}
                  disabled={workingIds.length === 0}
                  onClick={() => setWorking([])}
                />
              </>
            }
          >
            {allCleaners.length === 0 ? (
              <p className="text-sm text-sidebar-muted">{t('noCleanersFound')}</p>
            ) : (
              <div className="grid max-h-56 gap-1.5 overflow-y-auto sidebar-scroll sm:grid-cols-2">
                {allCleaners.map((c) => {
                  const isSupervisor =
                    c.role === 'SUPERVISOR' || c.titlePrefix === 'HOUSEKEEPING_SUPERVISOR';
                  const badges = [
                    ...(onShiftIds.has(c.id) ? [t('badgeShift')] : []),
                    ...(isSupervisor ? [t('badgeSupervisor')] : []),
                  ];
                  return (
                    <PersonPickRow
                      key={c.id}
                      label={c.name}
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
            title={t('restantCleaning')}
            description={t('restantCleaningHint')}
            count={restantIds.length ? t('selectedCount', { count: restantIds.length }) : t('auto')}
            actions={
              restantOptions.length > 0 ? (
                <>
                  <QuickLink
                    label={tCommon('all')}
                    onClick={() => setRestantIds(restantOptions.map((a) => a.id))}
                  />
                  <QuickLink
                    label={t('clear')}
                    disabled={restantIds.length === 0}
                    onClick={() => setRestantIds([])}
                  />
                </>
              ) : null
            }
          >
            {restantOptions.length === 0 ? (
              <p className="text-sm text-sidebar-muted">{t('noAssignees')}</p>
            ) : (
              <div className="grid max-h-48 gap-1.5 overflow-y-auto sidebar-scroll sm:grid-cols-2">
                {restantOptions.map((a) => (
                  <PersonPickRow
                    key={a.id}
                    label={a.name}
                    selected={restantIds.includes(a.id)}
                    onToggle={() => toggleId(restantIds, a.id, setRestantIds)}
                    badges={
                      a.role === 'SUPERVISOR' || a.titlePrefix === 'HOUSEKEEPING_SUPERVISOR'
                        ? [t('badgeSupervisor')]
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={t('lateShift')}
            description={t('lateShiftHint')}
            count={t('selectedCount', { count: lateIds.filter((id) => workingSet.has(id)).length })}
            actions={
              lateOptions.length > 0 ? (
                <>
                  <QuickLink
                    label={t('allWorking')}
                    onClick={() => setLateIds(lateOptions.map((c) => c.id))}
                  />
                  <QuickLink
                    label={t('clear')}
                    disabled={lateIds.length === 0}
                    onClick={() => setLateIds([])}
                  />
                </>
              ) : null
            }
          >
            {lateOptions.length === 0 ? (
              <p className="text-sm text-sidebar-muted">{t('selectWhoWorksFirst')}</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {lateOptions.map((c) => (
                  <PersonPickRow
                    key={c.id}
                    label={c.name}
                    selected={lateIds.includes(c.id)}
                    onToggle={() => toggleId(lateIds, c.id, setLateIds)}
                    tone="amber"
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={t('publicCleaning')}
            description={t('publicCleaningHint')}
            count={t('selectedCount', { count: publicIds.length })}
            actions={
              restantOptions.length > 0 ? (
                <>
                  {lateIds.length > 0 ? (
                    <QuickLink
                      label={t('useLateShift')}
                      onClick={() => setPublicIds(lateIds.filter((id) => workingSet.has(id)))}
                    />
                  ) : null}
                  <QuickLink
                    label={t('clear')}
                    disabled={publicIds.length === 0}
                    onClick={() => setPublicIds([])}
                  />
                </>
              ) : null
            }
          >
            {restantOptions.length === 0 ? (
              <p className="text-sm text-sidebar-muted">{t('noAssignees')}</p>
            ) : (
              <div className="grid max-h-48 gap-1.5 overflow-y-auto sidebar-scroll sm:grid-cols-2">
                {restantOptions.map((a) => (
                  <PersonPickRow
                    key={a.id}
                    label={a.name}
                    selected={publicIds.includes(a.id)}
                    onToggle={() => toggleId(publicIds, a.id, setPublicIds)}
                    badges={
                      a.role === 'SUPERVISOR' || a.titlePrefix === 'HOUSEKEEPING_SUPERVISOR'
                        ? [t('badgeSupervisor')]
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={t('whoInspectsToday')}
            description={t('whoInspectsTodayHint')}
            count={t('selectedCount', { count: inspectorIds.length })}
            actions={
              inspectorCandidates.length > 0 ? (
                <>
                  <QuickLink
                    label={tCommon('all')}
                    onClick={() => setInspectorIds(inspectorCandidates.map((c) => c.id))}
                  />
                  <QuickLink
                    label={t('clear')}
                    disabled={inspectorIds.length === 0}
                    onClick={() => setInspectorIds([])}
                  />
                </>
              ) : null
            }
          >
            {inspectorCandidates.length === 0 ? (
              <p className="text-sm text-sidebar-muted">{t('noEligibleInspectors')}</p>
            ) : (
              <div className="grid max-h-48 gap-1.5 overflow-y-auto sidebar-scroll sm:grid-cols-2">
                {inspectorCandidates.map((c) => (
                  <PersonPickRow
                    key={c.id}
                    label={c.name}
                    selected={inspectorIds.includes(c.id)}
                    onToggle={() => toggleId(inspectorIds, c.id, setInspectorIds)}
                    tone="emerald"
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={t('distribution')}
            description={t('distributionHint')}
            count={
              previewQ.data
                ? t('distributionTotal', { count: previewQ.data.dirtyRoomTotal })
                : undefined
            }
            actions={
              Object.keys(lockedTargets).length > 0 || roomAssignments ? (
                <QuickLink
                  label={t('resetDistribution')}
                  onClick={() => {
                    setLockedTargets({});
                    setRoomAssignments(null);
                    setSelectedRoomId(null);
                  }}
                />
              ) : null
            }
          >
            {workingIds.length === 0 ? (
              <p className="text-sm text-sidebar-muted">{t('selectWhoWorksFirst')}</p>
            ) : previewQ.isLoading && !previewQ.data ? (
              <p className="text-sm text-sidebar-muted">{t('loadingPreview')}</p>
            ) : previewPeople.length === 0 ? (
              <p className="text-sm text-sidebar-muted">{t('noDirtyForPreview')}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-3 text-[10px] text-sidebar-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400/90" />
                    {t('legendCheckedOut')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400/80" />
                    {t('legendDepartureInRoom')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white/25" />
                    {t('legendOther')}
                  </span>
                  <span className="text-sidebar-muted/80">{t('moveRoomsHint')}</span>
                </div>
                {previewPeople.map((person) => {
                  const count = person.dirtyRoomCount;
                  const othersHaveRooms = previewPeople.some(
                    (p) => p.userId !== person.userId && p.dirtyRoomCount > 0,
                  );
                  const fetching = previewQ.isFetching;
                  const isDropTarget = selectedRoomId != null || dragOverUserId === person.userId;
                  return (
                    <div
                      key={person.userId}
                      className={clsx(
                        'rounded-btn border px-3 py-2.5 transition',
                        selectedRoomId ? 'cursor-pointer' : null,
                        dragOverUserId === person.userId
                          ? 'border-action bg-action/15'
                          : selectedRoomId
                            ? 'border-action/40 bg-white/[0.04]'
                            : 'border-white/10 bg-white/[0.03]',
                      )}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverUserId(person.userId);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const roomId = e.dataTransfer.getData('text/plain');
                        if (roomId) moveRoomTo(roomId, person.userId);
                      }}
                      onClick={() => {
                        if (selectedRoomId) moveRoomTo(selectedRoomId, person.userId);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {person.name}
                            {person.isLateShift ? (
                              <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-200/80">
                                {t('badgeLate')}
                              </span>
                            ) : null}
                          </p>
                          {(person.restantCount > 0 || person.publicCount > 0) && (
                            <p className="text-[11px] text-sidebar-muted">
                              {[
                                person.restantCount > 0
                                  ? t('previewRestant', { count: person.restantCount })
                                  : null,
                                person.publicCount > 0
                                  ? t('previewPublic', { count: person.publicCount })
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-btn border border-sidebar-border text-white hover:bg-white/10 disabled:opacity-40"
                            disabled={fetching || count <= 0}
                            aria-label={t('fewerRooms')}
                            onClick={(e) => {
                              e.stopPropagation();
                              adjustDirtyCount(person.userId, -1);
                            }}
                          >
                            −
                          </button>
                          <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums text-white">
                            {count}
                          </span>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-btn border border-sidebar-border text-white hover:bg-white/10 disabled:opacity-40"
                            disabled={fetching || !othersHaveRooms}
                            aria-label={t('moreRooms')}
                            onClick={(e) => {
                              e.stopPropagation();
                              adjustDirtyCount(person.userId, 1);
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {person.rooms.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {person.rooms.map((room) => {
                            const selected = selectedRoomId === room.roomId;
                            return (
                              <button
                                key={room.roomId}
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', room.roomId);
                                  e.dataTransfer.effectAllowed = 'move';
                                  setSelectedRoomId(room.roomId);
                                }}
                                onDragEnd={() => setDragOverUserId(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRoomId((id) => (id === room.roomId ? null : room.roomId));
                                }}
                                title={
                                  room.guestCheckedOut
                                    ? t('roomCheckedOut', { number: room.roomNumber })
                                    : room.isDepartureToday
                                      ? t('roomDepartureInRoom', { number: room.roomNumber })
                                      : t('roomNumber', { number: room.roomNumber })
                                }
                                className={clsx(
                                  'cursor-grab rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none active:cursor-grabbing',
                                  selected
                                    ? 'ring-2 ring-action bg-action text-white'
                                    : room.guestCheckedOut
                                      ? 'bg-emerald-400/25 text-emerald-100 ring-1 ring-emerald-400/40'
                                      : room.isDepartureToday
                                        ? 'bg-amber-400/25 text-amber-100 ring-1 ring-amber-400/40'
                                        : 'bg-white/10 text-slate-200 hover:bg-white/20',
                                )}
                              >
                                {room.roomNumber}
                              </button>
                            );
                          })}
                        </div>
                      ) : isDropTarget ? (
                        <p className="mt-2 text-[10px] text-sidebar-muted">{t('dropRoomHere')}</p>
                      ) : null}
                    </div>
                  );
                })}
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
            {run.isPending ? t('assigning') : t('runAutoAssignment')}
          </Button>
          <Button
            variant="secondary"
            className="min-h-[44px] border-sidebar-border bg-transparent text-white hover:bg-white/10"
            onClick={onClose}
          >
            {tCommon('cancel')}
          </Button>
          {workingIds.length === 0 && !planQ.isLoading ? (
            <p className="w-full text-xs text-sidebar-muted sm:w-auto">
              {t('selectCleanerHint')}
            </p>
          ) : null}
          {run.isError && (
            <p className="w-full text-sm text-rose-400">
              {(run.error as Error)?.message || t('runError')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
