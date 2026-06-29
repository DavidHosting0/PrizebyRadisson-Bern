import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { ShiftHandoverStateDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

const t = {
  title: 'Schichtübergabe',
  essentialBadge: 'Pflicht',
  loading: 'Laden…',
  loadError: 'Laden fehlgeschlagen.',
  retry: 'Erneut',
  noTasks: 'Keine Aufgaben.',
  handoverButton: (next: string) => `→ ${next}`,
  handoverTitle: 'Übergabe bestätigen',
  handoverDescription: (from: string, to: string) => `${from} → ${to}`,
  incompleteWarning: (count: number) => `${count} optional offen`,
  incompleteEssentialWarning: (count: number) => `${count} Pflicht offen`,
  confirmLabel: (shift: string) => `„${shift}" eingeben`,
  cancel: 'Abbrechen',
  handoverConfirm: 'Bestätigen',
  handoverPending: '…',
  handoverSuccess: 'Übergeben.',
  toggleError: 'Fehler.',
};

function parseApiError(raw: string): string {
  try {
    const j = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join(', ');
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* plain text */
  }
  return raw || t.toggleError;
}

function shiftAccent(shift: string): string {
  if (shift === 'NIGHT') return 'border-indigo-300 bg-indigo-50 text-indigo-900';
  if (shift === 'MORNING') return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-sky-300 bg-sky-50 text-sky-900';
}

export function ShiftHandoverBoard() {
  const qc = useQueryClient();
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'warning' } | null>(null);

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
    onError: (err: Error) => setToast({ msg: parseApiError(err.message), kind: 'warning' }),
  });

  const handover = useMutation({
    mutationFn: (confirmShiftName: string) =>
      api('/shift-handover/handover', {
        method: 'POST',
        body: JSON.stringify({ confirmShiftName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-handover'] });
      setHandoverOpen(false);
      setConfirmName('');
      setToast({ msg: t.handoverSuccess, kind: 'success' });
    },
    onError: (err: Error) => setToast({ msg: parseApiError(err.message), kind: 'warning' }),
  });

  const incompleteOptionalCount = useMemo(
    () => (data ? data.tasks.filter((task) => !task.essential && !task.completed).length : 0),
    [data],
  );

  const incompleteEssentialCount = useMemo(
    () => (data ? data.essentialTotalCount - data.essentialCompletedCount : 0),
    [data],
  );

  const essentialComplete = incompleteEssentialCount === 0;

  const confirmMatches = useMemo(() => {
    if (!data) return false;
    return confirmName.trim().toLowerCase() === data.nextShiftLabel.trim().toLowerCase();
  }, [confirmName, data]);

  if (isLoading) {
    return <p className="p-3 text-xs text-ink-muted">{t.loading}</p>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-2 p-3">
        <p className="text-xs text-danger">{t.loadError}</p>
        <Button type="button" variant="secondary" className="min-h-[30px]" onClick={() => refetch()}>
          {t.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-2.5 pb-3">
      {toast && (
        <div
          className={clsx(
            'rounded-md border px-2 py-1.5 text-[11px]',
            toast.kind === 'success'
              ? 'border-success/30 bg-success-muted text-success'
              : 'border-warning/30 bg-warning-muted text-warning',
          )}
        >
          {toast.msg}
        </div>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t.title}</h2>

      <Card className={clsx('border', shiftAccent(data.activeShift))} padding>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{data.activeShiftLabel}</p>
            {data.lastHandoverAt && data.lastHandoverBy && (
              <p className="mt-0.5 truncate text-[9px] opacity-70">
                {data.lastHandoverBy.name.split(' ')[0]},{' '}
                {new Date(data.lastHandoverAt).toLocaleDateString('de-CH')}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums leading-none">
              {data.essentialCompletedCount}/{data.essentialTotalCount}
            </p>
            <p className="text-[9px] opacity-75 tabular-nums">
              {data.completedCount}/{data.totalCount}
            </p>
          </div>
        </div>
      </Card>

      <ul className="space-y-1">
        {data.tasks.map((task) => (
          <li key={task.id}>
            <label
              className={clsx(
                'flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 transition-colors',
                task.completed
                  ? 'border-success/30 bg-success/5'
                  : task.essential
                    ? 'border-action/40 bg-action/5 hover:bg-action/10'
                    : 'border-border bg-surface hover:bg-surface-muted/50',
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-action"
                checked={task.completed}
                disabled={toggleTask.isPending}
                onChange={(e) =>
                  toggleTask.mutate({ taskId: task.id, completed: e.target.checked })
                }
              />
              <span className="min-w-0 flex-1">
                <span
                  className={clsx(
                    'block text-xs leading-snug',
                    task.completed && 'text-ink-muted line-through',
                  )}
                >
                  {task.label}
                </span>
                {task.essential && !task.completed && (
                  <span className="mt-0.5 inline-block rounded bg-action/15 px-1 py-px text-[8px] font-semibold uppercase text-action">
                    {t.essentialBadge}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {data.tasks.length === 0 && <p className="text-xs text-ink-muted">{t.noTasks}</p>}

      <Button
        type="button"
        variant="primary"
        fullWidth
        className="min-h-[32px]"
        disabled={!essentialComplete}
        onClick={() => {
          setConfirmName('');
          setHandoverOpen(true);
        }}
      >
        {t.handoverButton(data.nextShiftLabel)}
      </Button>

      {handoverOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-ink/40 p-2"
          role="dialog"
          aria-modal
          onClick={() => !handover.isPending && setHandoverOpen(false)}
        >
          <div
            className="w-full rounded-lg border border-border bg-surface p-3 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xs font-semibold text-ink">{t.handoverTitle}</h3>
            <p className="mt-1 text-[11px] text-ink-muted">
              {t.handoverDescription(data.activeShiftLabel, data.nextShiftLabel)}
            </p>

            {incompleteEssentialCount > 0 && (
              <p className="mt-1.5 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[11px] text-danger">
                {t.incompleteEssentialWarning(incompleteEssentialCount)}
              </p>
            )}

            {incompleteOptionalCount > 0 && essentialComplete && (
              <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                {t.incompleteWarning(incompleteOptionalCount)}
              </p>
            )}

            <label className="mt-2 flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-muted">{t.confirmLabel(data.nextShiftLabel)}</span>
              <input
                className="min-h-[34px] rounded-md border border-border bg-surface px-2 text-xs"
                value={confirmName}
                autoComplete="off"
                placeholder={data.nextShiftLabel}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </label>

            <div className="mt-2 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="secondary"
                className="min-h-[30px] px-2.5"
                disabled={handover.isPending}
                onClick={() => setHandoverOpen(false)}
              >
                {t.cancel}
              </Button>
              <Button
                type="button"
                variant="primary"
                className="min-h-[30px] px-2.5"
                disabled={!confirmMatches || !essentialComplete || handover.isPending}
                onClick={() => handover.mutate(confirmName.trim())}
              >
                {handover.isPending ? t.handoverPending : t.handoverConfirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
