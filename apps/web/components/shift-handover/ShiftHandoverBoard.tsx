'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { ShiftHandoverStateDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/toast/ToastProvider';

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
  if (shift === 'NIGHT') return 'border-indigo-300 bg-indigo-50 text-indigo-900';
  if (shift === 'MORNING') return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-sky-300 bg-sky-50 text-sky-900';
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
    onSuccess: (next) => {
      qc.setQueryData(['shift-handover'], next);
    },
    onError: (err: Error) => toast.push(parseApiError(err.message), 'warning'),
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

  const incompleteCount = useMemo(
    () => (data ? data.totalCount - data.completedCount : 0),
    [data],
  );

  const confirmMatches = useMemo(() => {
    if (!data) return false;
    return confirmName.trim().toLowerCase() === data.nextShiftLabel.trim().toLowerCase();
  }, [confirmName, data]);

  if (isLoading) {
    return <p className="p-4 text-sm text-ink-muted">{t('loading')}</p>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-danger">{t('loadError')}</p>
        <Button type="button" variant="secondary" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
      </div>

      <Card className={clsx('border-2 p-5', shiftAccent(data.activeShift))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{t('activeShift')}</p>
            <p className="text-2xl font-semibold">{data.activeShiftLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums">
              {data.completedCount} / {data.totalCount}
            </p>
            <p className="text-sm opacity-80">{t('completed')}</p>
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
      </Card>

      <ul className="space-y-2">
        {data.tasks.map((task) => (
          <li key={task.id}>
            <label
              className={clsx(
                'flex min-h-[52px] cursor-pointer items-start gap-3 rounded-card border px-4 py-3 transition-colors',
                task.completed
                  ? 'border-success/30 bg-success/5'
                  : 'border-border bg-surface hover:bg-surface-muted/50',
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 rounded border-border accent-brand"
                checked={task.completed}
                disabled={toggleTask.isPending}
                onChange={(e) =>
                  toggleTask.mutate({ taskId: task.id, completed: e.target.checked })
                }
              />
              <span className={clsx('flex-1 text-sm', task.completed && 'text-ink-muted line-through')}>
                {task.label}
              </span>
              {task.completed && task.completedBy && (
                <span className="shrink-0 text-xs text-ink-muted">{task.completedBy.name}</span>
              )}
            </label>
          </li>
        ))}
      </ul>

      {data.tasks.length === 0 && (
        <p className="text-sm text-ink-muted">{t('noTasks')}</p>
      )}

      <div className="sticky bottom-4 z-10">
        <Button
          type="button"
          variant="primary"
          className="min-h-[52px] w-full text-base"
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => !handover.isPending && setHandoverOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-ink">{t('handoverTitle')}</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {t('handoverDescription', { from: data.activeShiftLabel, to: data.nextShiftLabel })}
            </p>

            {incompleteCount > 0 && (
              <p className="mt-3 rounded-btn border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {t('incompleteWarning', { count: incompleteCount })}
              </p>
            )}

            <label className="mt-4 flex flex-col gap-1">
              <span className="text-sm text-ink-muted">
                {t('confirmLabel', { shift: data.nextShiftLabel })}
              </span>
              <input
                className="min-h-[48px] rounded-btn border border-border bg-surface px-3 text-sm"
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
                className="min-h-[44px]"
                disabled={handover.isPending}
                onClick={() => setHandoverOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                className="min-h-[44px]"
                disabled={!confirmMatches || handover.isPending}
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
