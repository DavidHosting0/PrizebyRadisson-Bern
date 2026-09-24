'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { DailyCleaningPlanResponse, DailyCleaningTaskDto } from '@housekeeping/shared';
import { formatFloorLabel } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { GuestStayTypeIcons } from '@/components/reception/GuestStayTypeIcons';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { useTranslations } from 'next-intl';

export type RoomAssignmentCrewOptions = {
  date?: string;
  workingTodayUserIds: string[];
  restantAssigneeUserIds: string[];
  lateShiftUserIds: string[];
  publicAssigneeUserIds: string[];
  inspectorUserIds: string[];
};

const PAINT_COLORS = [
  '#3B6FA0',
  '#C45C26',
  '#2A9D8F',
  '#9B5DE5',
  '#D4A017',
  '#E76F51',
  '#457B9D',
  '#2A9D4F',
  '#F4A261',
  '#6D597A',
  '#118AB2',
  '#EF476F',
];

function colorForIndex(i: number): string {
  return PAINT_COLORS[i % PAINT_COLORS.length]!;
}

function seedEvenSplit(ids: string[], userIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (userIds.length === 0) return out;
  const ordered = [...userIds].sort((a, b) => a.localeCompare(b));
  ids.forEach((id, idx) => {
    out[id] = ordered[idx % ordered.length]!;
  });
  return out;
}

type CleanerChip = {
  id: string;
  name: string;
  color: string;
  isLate: boolean;
  isRestant: boolean;
  isInspect: boolean;
};

export function RoomAssignmentPaintView({
  open,
  onClose,
  onSaved,
  crew,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  crew: RoomAssignmentCrewOptions;
}) {
  const t = useTranslations('supervisor.autoAssignModal');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const dateParam = crew.date?.trim()
    ? `?date=${encodeURIComponent(crew.date.trim())}`
    : '';

  const planQ = useQuery({
    queryKey: ['assignments', 'daily-plan', 'paint', crew.date ?? 'today'],
    queryFn: () => api<DailyCleaningPlanResponse>(`/assignments/daily-plan${dateParam}`),
    enabled: open,
  });

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [roomAssign, setRoomAssign] = useState<Record<string, string>>({});
  const [publicAssign, setPublicAssign] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnSeconds, setWarnSeconds] = useState(5);
  const [dirtyLocal, setDirtyLocal] = useState(false);

  const workingSet = useMemo(() => new Set(crew.workingTodayUserIds), [crew.workingTodayUserIds]);
  const lateSet = useMemo(() => new Set(crew.lateShiftUserIds), [crew.lateShiftUserIds]);
  const restantSet = useMemo(
    () => new Set(crew.restantAssigneeUserIds),
    [crew.restantAssigneeUserIds],
  );
  const inspectSet = useMemo(() => new Set(crew.inspectorUserIds), [crew.inspectorUserIds]);

  const cleaners: CleanerChip[] = useMemo(() => {
    const byId = new Map(
      [...(planQ.data?.allCleaners ?? []), ...(planQ.data?.workingToday ?? [])].map((c) => [
        c.id,
        c,
      ]),
    );
    return [...crew.workingTodayUserIds]
      .sort((a, b) => a.localeCompare(b))
      .map((id, i) => {
        const c = byId.get(id);
        return {
          id,
          name: c?.name ?? id,
          color: colorForIndex(i),
          isLate: lateSet.has(id),
          isRestant: restantSet.has(id),
          isInspect: inspectSet.has(id),
        };
      });
  }, [crew.workingTodayUserIds, planQ.data, lateSet, restantSet, inspectSet]);

  const colorByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cleaners) m.set(c.id, c.color);
    return m;
  }, [cleaners]);

  const roomCountByUser = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cleaners) counts[c.id] = 0;
    for (const userId of Object.values(roomAssign)) {
      counts[userId] = (counts[userId] ?? 0) + 1;
    }
    return counts;
  }, [cleaners, roomAssign]);

  const openTasks = useMemo(
    () => (planQ.data?.tasks ?? []).filter((t) => !t.completedAt),
    [planQ.data?.tasks],
  );

  const dirtyTasks = useMemo(
    () =>
      openTasks
        .filter((t) => t.workType === 'DIRTY' && t.roomId)
        .sort((a, b) =>
          (a.roomNumber ?? '').localeCompare(b.roomNumber ?? '', undefined, { numeric: true }),
        ),
    [openTasks],
  );

  const restantTasks = useMemo(
    () =>
      openTasks
        .filter((t) => t.workType === 'RESTANT' && t.roomId)
        .sort((a, b) => {
          const aExt = a.isExtensiveRestant ? 1 : 0;
          const bExt = b.isExtensiveRestant ? 1 : 0;
          if (aExt !== bExt) return bExt - aExt;
          return (a.roomNumber ?? '').localeCompare(b.roomNumber ?? '', undefined, {
            numeric: true,
          });
        }),
    [openTasks],
  );

  const publicTasks = useMemo(
    () =>
      openTasks
        .filter((t) => t.workType === 'PUBLIC' && t.publicAreaId)
        .sort((a, b) => (a.publicAreaName ?? '').localeCompare(b.publicAreaName ?? '')),
    [openTasks],
  );

  const dirtyByFloor = useMemo(() => {
    const map = new Map<number | 'none', DailyCleaningTaskDto[]>();
    for (const task of dirtyTasks) {
      const key = task.floor ?? 'none';
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === 'none') return 1;
      if (b[0] === 'none') return -1;
      return (a[0] as number) - (b[0] as number);
    });
  }, [dirtyTasks]);

  useEffect(() => {
    if (!open) {
      setSeeded(false);
      setSelectedUserId(null);
      setRoomAssign({});
      setPublicAssign({});
      setWarnOpen(false);
      setDirtyLocal(false);
      return;
    }
    if (!planQ.data || seeded) return;
    const restantIds = restantTasks.map((t) => t.roomId!).filter(Boolean);
    const publicIds = publicTasks.map((t) => t.publicAreaId!).filter(Boolean);
    setRoomAssign(seedEvenSplit(restantIds, crew.restantAssigneeUserIds));
    setPublicAssign(seedEvenSplit(publicIds, crew.publicAssigneeUserIds));
    setSelectedUserId(crew.workingTodayUserIds.slice().sort()[0] ?? null);
    setSeeded(true);
    setDirtyLocal(false);
  }, [
    open,
    planQ.data,
    seeded,
    restantTasks,
    publicTasks,
    crew.restantAssigneeUserIds,
    crew.publicAssigneeUserIds,
    crew.workingTodayUserIds,
  ]);

  useEffect(() => {
    if (!warnOpen) return;
    setWarnSeconds(5);
    const id = window.setInterval(() => {
      setWarnSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [warnOpen]);

  const unassignedRooms = useMemo(() => {
    const rooms = [...dirtyTasks, ...restantTasks];
    return rooms.filter((t) => t.roomId && !roomAssign[t.roomId]);
  }, [dirtyTasks, restantTasks, roomAssign]);

  const unassignedPublics = useMemo(
    () => publicTasks.filter((t) => t.publicAreaId && !publicAssign[t.publicAreaId]),
    [publicTasks, publicAssign],
  );

  const totalRooms = dirtyTasks.length + restantTasks.length;
  const assignedRooms = totalRooms - unassignedRooms.length;
  const progressPct = totalRooms > 0 ? Math.round((assignedRooms / totalRooms) * 100) : 100;

  const save = useMutation({
    mutationFn: async () => {
      const date = crew.date?.trim() || undefined;
      await api<DailyCleaningPlanResponse>('/assignments/daily-plan/run', {
        method: 'POST',
        body: JSON.stringify({
          date,
          workingTodayUserIds: crew.workingTodayUserIds,
          restantAssigneeUserIds: crew.restantAssigneeUserIds,
          lateShiftUserIds: crew.lateShiftUserIds.filter((id) => workingSet.has(id)),
          publicAssigneeUserIds: crew.publicAssigneeUserIds,
          inspectorUserIds: crew.inspectorUserIds,
          dirtyRoomAssignments: Object.entries(roomAssign).map(([roomId, userId]) => ({
            roomId,
            userId,
          })),
          publicAreaAssignments: Object.entries(publicAssign).map(([publicAreaId, userId]) => ({
            publicAreaId,
            userId,
          })),
        }),
      });
      const saveQs = date ? `?date=${encodeURIComponent(date)}` : '';
      return api<DailyCleaningPlanResponse>(`/assignments/daily-plan/save${saveQs}`, {
        method: 'POST',
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['assignments'] });
      await qc.invalidateQueries({ queryKey: ['rooms'] });
      setWarnOpen(false);
      onSaved?.();
      onClose();
    },
  });

  function requestSave() {
    if (unassignedRooms.length > 0 || unassignedPublics.length > 0) {
      setWarnOpen(true);
      return;
    }
    save.mutate();
  }

  function paintRoom(roomId: string) {
    if (!selectedUserId) return;
    setDirtyLocal(true);
    setRoomAssign((prev) => {
      const next = { ...prev };
      if (next[roomId] === selectedUserId) delete next[roomId];
      else next[roomId] = selectedUserId;
      return next;
    });
  }

  function paintPublic(publicAreaId: string) {
    if (!selectedUserId) return;
    setDirtyLocal(true);
    setPublicAssign((prev) => {
      const next = { ...prev };
      if (next[publicAreaId] === selectedUserId) delete next[publicAreaId];
      else next[publicAreaId] = selectedUserId;
      return next;
    });
  }

  function handleClose() {
    if (dirtyLocal && !window.confirm(t('discardPaintConfirm'))) return;
    onClose();
  }

  const rootRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({ open, onClose: handleClose, containerRef: rootRef });

  const selectedColor = selectedUserId ? colorByUser.get(selectedUserId) : undefined;

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60] flex flex-col text-white"
      style={{
        background:
          'radial-gradient(1200px 500px at 10% -10%, rgba(59,111,160,0.22), transparent 55%), radial-gradient(900px 420px at 90% 0%, rgba(42,157,143,0.12), transparent 50%), #0c121a',
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#111923]/80 px-4 py-3.5 backdrop-blur-md sm:px-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
            {t('paintEyebrow')}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight sm:text-xl">{t('paintTitle')}</h2>
          <p className="mt-0.5 text-xs text-sidebar-muted">{t('selectCleanerHint')}</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 p-2 text-sidebar-muted transition hover:bg-white/10 hover:text-white"
          aria-label={tCommon('close')}
          onClick={handleClose}
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
      </header>

      <div className="shrink-0 border-b border-white/10 bg-[#141c28]/75 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="flex gap-2.5 overflow-x-auto pb-1 sidebar-scroll">
          {cleaners.map((c) => {
            const selected = selectedUserId === c.id;
            const roomCount = roomCountByUser[c.id] ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedUserId(c.id)}
                className={clsx(
                  'group relative flex min-w-[168px] shrink-0 overflow-hidden rounded-xl border text-left transition',
                  selected
                    ? 'border-white/30 bg-[#1A2332] shadow-[0_0_0_2px_rgba(255,255,255,0.18)]'
                    : 'border-white/10 bg-[#1A2332]/80 hover:border-white/20 hover:bg-[#1e2a3a]',
                )}
              >
                <span
                  className="w-1.5 shrink-0 self-stretch"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2.5">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-white">{c.name}</span>
                    <span
                      className={clsx(
                        'mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[#1A2332]',
                        selected ? 'scale-110' : 'opacity-80',
                      )}
                      style={{ backgroundColor: c.color }}
                      aria-hidden
                    />
                  </span>
                  <span className="text-[11px] font-medium tabular-nums text-slate-300">
                    {t('paintRoomCount', { count: roomCount })}
                  </span>
                  {(c.isLate || c.isRestant || c.isInspect) && (
                    <span className="flex flex-wrap gap-1">
                      {c.isLate ? (
                        <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                          {t('badgeLate')}
                        </span>
                      ) : null}
                      {c.isRestant ? (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-300">
                          {t('restants')}
                        </span>
                      ) : null}
                      {c.isInspect ? (
                        <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200">
                          {t('badgeInspect')}
                        </span>
                      ) : null}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-scroll min-h-0 flex-1 space-y-7 overflow-y-auto px-4 py-5 sm:px-6">
        {planQ.isLoading ? (
          <p className="text-sm text-sidebar-muted">{t('loadingStaff')}</p>
        ) : (
          <>
            <PaintSection
              title={t('sectionDirty')}
              count={dirtyTasks.length}
              empty={dirtyByFloor.length === 0 ? t('noDirtyForPreview') : null}
            >
              <div className="space-y-5">
                {dirtyByFloor.map(([floor, tasks]) => (
                  <div key={String(floor)}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {floor === 'none' ? '—' : formatFloorLabel(floor)}
                      </p>
                      <span className="h-px flex-1 bg-white/8" />
                      <span className="text-[10px] tabular-nums text-sidebar-muted">{tasks.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tasks.map((task) => (
                        <PaintTile
                          key={task.id}
                          label={task.roomNumber ?? '—'}
                          color={
                            task.roomId && roomAssign[task.roomId]
                              ? colorByUser.get(roomAssign[task.roomId]!)
                              : undefined
                          }
                          brushColor={selectedColor}
                          onClick={() => task.roomId && paintRoom(task.roomId)}
                          disabled={!selectedUserId}
                          isDepartureToday={task.isDepartureToday === true}
                          guestCheckedOut={task.guestCheckedOut === true}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </PaintSection>

            <PaintSection
              title={t('sectionRestants')}
              count={restantTasks.length}
              empty={restantTasks.length === 0 ? t('noRestantsPaint') : null}
            >
              <div className="flex flex-wrap gap-2">
                {restantTasks.map((task) => (
                  <PaintTile
                    key={task.id}
                    label={task.roomNumber ?? '—'}
                    sub={task.isExtensiveRestant ? t('extensiveRestantShort') : undefined}
                    highlight={task.isExtensiveRestant === true}
                    color={
                      task.roomId && roomAssign[task.roomId]
                        ? colorByUser.get(roomAssign[task.roomId]!)
                        : undefined
                    }
                    brushColor={selectedColor}
                    onClick={() => task.roomId && paintRoom(task.roomId)}
                    disabled={!selectedUserId}
                    isDepartureToday={task.isDepartureToday === true}
                    guestCheckedOut={task.guestCheckedOut === true}
                  />
                ))}
              </div>
            </PaintSection>

            <PaintSection
              title={t('sectionPublic')}
              count={publicTasks.length}
              empty={publicTasks.length === 0 ? t('noPublicPaint') : null}
            >
              <div className="flex flex-wrap gap-2">
                {publicTasks.map((task) => (
                  <PaintTile
                    key={task.id}
                    label={task.publicAreaName ?? '—'}
                    sub={task.floor != null ? formatFloorLabel(task.floor) : undefined}
                    color={
                      task.publicAreaId && publicAssign[task.publicAreaId]
                        ? colorByUser.get(publicAssign[task.publicAreaId]!)
                        : undefined
                    }
                    brushColor={selectedColor}
                    onClick={() => task.publicAreaId && paintPublic(task.publicAreaId)}
                    disabled={!selectedUserId}
                    wide
                  />
                ))}
              </div>
            </PaintSection>
          </>
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-3 border-t border-white/10 bg-[#111923]/95 px-4 py-3.5 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-action transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="shrink-0 text-xs tabular-nums text-sidebar-muted">
            {t('paintProgress', { assigned: assignedRooms, total: totalRooms })}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-sidebar-muted">
            {t('unassignedSummary', {
              rooms: unassignedRooms.length,
              publics: unassignedPublics.length,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="min-h-[44px] border-sidebar-border bg-transparent text-white hover:bg-white/10"
              onClick={handleClose}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="action"
              className="min-h-[44px]"
              disabled={save.isPending || planQ.isLoading || cleaners.length === 0}
              onClick={requestSave}
            >
              {save.isPending ? t('saving') : t('saveAssignment')}
            </Button>
          </div>
        </div>
        {save.isError ? (
          <p className="text-sm text-rose-400">
            {(save.error as Error)?.message || t('runError')}
          </p>
        ) : null}
      </footer>

      {warnOpen ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-card border border-amber-400/40 bg-[#1A2332] p-5 shadow-lift"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paint-incomplete-title"
          >
            <h3 id="paint-incomplete-title" className="text-base font-semibold text-amber-100">
              {t('incompleteTitle')}
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              {unassignedRooms.length > 0 ? (
                <li className="font-medium text-amber-50">
                  {t('incompleteRooms', { count: unassignedRooms.length })}
                </li>
              ) : null}
              {unassignedPublics.length > 0 ? (
                <li>{t('incompletePublic', { count: unassignedPublics.length })}</li>
              ) : null}
            </ul>
            <p className="mt-3 text-xs text-sidebar-muted">
              {warnSeconds > 0 ? t('incompleteWait', { seconds: warnSeconds }) : null}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                className="border-sidebar-border bg-transparent text-white hover:bg-white/10"
                onClick={() => setWarnOpen(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                variant="action"
                disabled={warnSeconds > 0 || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? t('saving') : t('confirmSaveAnyway')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PaintSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A2332]/55 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
          {title}
        </h3>
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
          {count}
        </span>
      </div>
      {empty ? <p className="text-sm text-sidebar-muted">{empty}</p> : children}
    </section>
  );
}

function PaintTile({
  label,
  sub,
  color,
  brushColor,
  onClick,
  disabled,
  wide,
  highlight,
  isDepartureToday,
  guestCheckedOut,
}: {
  label: string;
  sub?: string;
  color?: string;
  brushColor?: string;
  onClick: () => void;
  disabled?: boolean;
  wide?: boolean;
  highlight?: boolean;
  isDepartureToday?: boolean;
  guestCheckedOut?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'relative rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
        wide ? 'min-w-[148px]' : 'min-w-[56px]',
        color
          ? 'border-transparent text-white shadow-[0_1px_0_rgba(0,0,0,0.25)]'
          : 'border-dashed border-white/20 bg-white/[0.03] text-slate-200 hover:border-white/35 hover:bg-white/[0.07]',
        highlight && !color && 'ring-2 ring-orange-400/80 border-orange-400/50 bg-orange-500/15',
        highlight && color && 'ring-2 ring-orange-200/90',
      )}
      style={
        color
          ? { backgroundColor: color }
          : brushColor
            ? { boxShadow: `inset 0 0 0 1px ${brushColor}55` }
            : undefined
      }
    >
      <span className="flex items-start justify-between gap-1.5">
        <span className="block text-sm font-semibold tabular-nums leading-none tracking-tight">
          {label}
        </span>
        {isDepartureToday ? (
          <GuestStayTypeIcons
            stay={{
              isDepartureToday: true,
              checkOut: guestCheckedOut === true,
              ocoDone: guestCheckedOut === true,
            }}
            size="xs"
            onColor={Boolean(color)}
          />
        ) : null}
      </span>
      {sub ? <span className="mt-1 block text-[10px] opacity-80">{sub}</span> : null}
    </button>
  );
}
