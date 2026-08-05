'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { ShiftHandoverStateDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/toast/ToastProvider';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';

function parseApiError(raw: string): string {
  try {
    const j = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join(', ');
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* plain text */
  }
  return raw || 'Request failed';
}

function shiftAccent(shift: string): string {
  if (shift === 'NIGHT') return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200';
  if (shift === 'MORNING') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
}

export function ShiftHandoverBoard() {
  const t = useTranslations('shiftHandover');
  const toast = useToast();
  const qc = useQueryClient();
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shift-handover'],
    queryFn: () => api<ShiftHandoverStateDto>('/shift-handover'),
    refetchInterval: 30_000,
  });

  const toggleTask = useMutation({
    mutationFn: ({ taskId, completed }: { taskId: string; completed: boolean }) =>
      api<ShiftHandoverStateDto>(`/shift-handover/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      }),
    onMutate: async ({ taskId, completed }) => {
      await qc.cancelQueries({ queryKey: ['shift-handover'] });
      const prev = qc.getQueryData<ShiftHandoverStateDto>(['shift-handover']);
      if (prev) {
        const tasks = prev.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                completed,
                completedAt: completed ? new Date().toISOString() : null,
                completedBy: completed ? task.completedBy : null,
              }
            : task,
        );
        const completedCount = tasks.filter((t) => t.completed).length;
        const essentialCompletedCount = tasks.filter((t) => t.essential && t.completed).length;
        qc.setQueryData<ShiftHandoverStateDto>(['shift-handover'], {
          ...prev,
          tasks,
          completedCount,
          essentialCompletedCount,
        });
      }
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['shift-handover'], ctx.prev);
      toast.push(parseApiError(err.message), 'warning');
    },
    onSuccess: (next) => {
      qc.setQueryData(['shift-handover'], next);
    },
  });

  const handover = useMutation({
    mutationFn: (confirmShiftName: string) =>
      api('/shift-handover/handover', {
        method: 'POST',
        body: JSON.stringify({ confirmShiftName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-handover'] });
      qc.invalidateQueries({ queryKey: ['shift-handover', 'log'] });
      setHandoverOpen(false);
      setConfirmName('');
      toast.push(t('handoverSuccess'), 'success');
    },
    onError: (err: Error) => toast.push(parseApiError(err.message), 'warning'),
  });

  const incompleteOptionalCount = useMemo(
    () => (data ? data.tasks.filter((task) => !task.essential && !task.completed).length : 0),
    [data],
  );

  const incompleteEssentialCount = useMemo(
    () =>
      data ? data.essentialTotalCount - data.essentialCompletedCount : 0,
    [data],
  );

  const handoverPanelRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({
    open: handoverOpen,
    onClose: () => {
      if (!handover.isPending) setHandoverOpen(false);
    },
    containerRef: handoverPanelRef,
  });

  const essentialComplete = incompleteEssentialCount === 0;

  const confirmMatches = useMemo(() => {
    if (!data) return false;
    return confirmName.trim().toLowerCase() === data.nextShiftLabel.trim().toLowerCase();
  }, [confirmName, data]);

  if (isLoading) {
    return <p className="p-4 text-sm text-sidebar-muted">{t('loading')}</p>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-rose-300">{t('loadError')}</p>
        <Button
          type="button"
          variant="secondary"
          className="border-sidebar-border bg-transparent text-white hover:bg-white/10"
          onClick={() => refetch()}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{t('title')}</h1>
        <p className="mt-1 text-sm text-sidebar-muted">{t('subtitle')}</p>
      </div>

      <div className={clsx('rounded-card border-2 p-5', shiftAccent(data.activeShift))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{t('activeShift')}</p>
            <p className="text-2xl font-semibold">{data.activeShiftLabel}</p>
            <p className="mt-0.5 text-sm opacity-80">
              {(() => {
                const [y, m, d] = data.activeDate.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString('de-CH', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                });
              })()}
              {data.nextHandoverAdvancesDay
                ? ` · nächste Übergabe startet den Folgetag (${data.nextShiftLabel})`
                : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums">
              {data.essentialCompletedCount} / {data.essentialTotalCount}
            </p>
            <p className="text-sm opacity-80">
              {t('essentialCompleted', {
                done: data.essentialCompletedCount,
                total: data.essentialTotalCount,
              })}
            </p>
            <p className="mt-1 text-xs opacity-75 tabular-nums">
              {data.completedCount} / {data.totalCount} {t('completed')}
            </p>
          </div>
        </div>
        {data.lastHandoverAt && data.lastHandoverBy && (
          <p className="mt-3 text-xs opacity-75">
            {t('lastHandover', {
              name: data.lastHandoverBy.name,
              time: new Date(data.lastHandoverAt).toLocaleString(),
            })}
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {data.tasks.map((task) => (
          <li key={task.id}>
            <label
              className={clsx(
                'flex min-h-[52px] cursor-pointer items-start gap-3 rounded-card border px-4 py-3 transition-colors',
                task.completed
                  ? 'border-success/30 bg-success/10'
                  : task.essential
                    ? 'border-action/40 bg-action/10 hover:bg-action/15'
                    : 'border-sidebar-border/60 bg-[#1A2332] hover:bg-white/5',
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 rounded border-sidebar-border accent-action"
                checked={task.completed}
                disabled={
                  toggleTask.isPending && toggleTask.variables?.taskId === task.id
                }
                onChange={(e) =>
                  toggleTask.mutate({ taskId: task.id, completed: e.target.checked })
                }
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={clsx('text-sm text-white', task.completed && 'text-sidebar-muted line-through')}>
                  {task.label}
                </span>
                {task.essential && !task.completed && (
                  <span className="w-fit rounded-full bg-action/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-action">
                    {t('essentialBadge')}
                  </span>
                )}
              </span>
              {task.completed && task.completedBy && (
                <span className="shrink-0 text-xs text-sidebar-muted">{task.completedBy.name}</span>
              )}
            </label>
          </li>
        ))}
      </ul>

      {data.tasks.length === 0 && (
        <p className="text-sm text-sidebar-muted">{t('noTasks')}</p>
      )}

      <div className="sticky bottom-4 z-10">
        <Button
          type="button"
          variant="primary"
          className="min-h-[52px] w-full text-base"
          disabled={!essentialComplete}
          onClick={() => {
            setConfirmName('');
            setHandoverOpen(true);
          }}
        >
          {t('handoverButton', { next: data.nextShiftLabel })}
        </Button>
      </div>

      {handoverOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => !handover.isPending && setHandoverOpen(false)}
        >
          <div
            ref={handoverPanelRef}
            className={clsx(APP_DARK_CARD, 'w-full max-w-md p-5 shadow-lift')}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white">{t('handoverTitle')}</h2>
            <p className="mt-2 text-sm text-sidebar-muted">
              {t('handoverDescription', { from: data.activeShiftLabel, to: data.nextShiftLabel })}
            </p>

            {incompleteEssentialCount > 0 && (
              <p className="mt-3 rounded-btn border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {t('incompleteEssentialWarning', { count: incompleteEssentialCount })}
              </p>
            )}

            {incompleteOptionalCount > 0 && essentialComplete && (
              <p className="mt-3 rounded-btn border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                {t('incompleteWarning', { count: incompleteOptionalCount })}
              </p>
            )}

            <label className="mt-4 flex flex-col gap-1">
              <span className="text-sm text-sidebar-muted">
                {t('confirmLabel', { shift: data.nextShiftLabel })}
              </span>
              <input
                className={clsx(APP_DARK_INPUT, 'min-h-[48px]')}
                value={confirmName}
                autoComplete="off"
                placeholder={data.nextShiftLabel}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px] border-sidebar-border bg-transparent text-white hover:bg-white/10"
                disabled={handover.isPending}
                onClick={() => setHandoverOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="action"
                className="min-h-[44px]"
                disabled={!confirmMatches || !essentialComplete || handover.isPending}
                onClick={() => handover.mutate(confirmName.trim())}
              >
                {handover.isPending ? t('handoverPending') : t('handoverConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
