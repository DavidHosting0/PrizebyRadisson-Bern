import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { ShiftHandoverStateDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

const t = {
  title: 'Schichtübergabe',
  subtitle:
    'Checkliste für die aktuelle Rezeptionsschicht. Pflichtaufgaben müssen erledigt sein, bevor an die nächste Schicht übergeben werden kann.',
  activeShift: 'Aktive Schicht',
  completed: 'gesamt erledigt',
  essentialCompleted: (done: number, total: number) => `Pflicht: ${done} / ${total}`,
  essentialBadge: 'Pflicht',
  loading: 'Checkliste wird geladen…',
  loadError: 'Checkliste konnte nicht geladen werden.',
  retry: 'Erneut versuchen',
  noTasks: 'Keine Aufgaben für diese Schicht.',
  lastHandover: (name: string, time: string) => `Letzte Übergabe durch ${name} am ${time}`,
  handoverButton: (next: string) => `An ${next} übergeben`,
  handoverTitle: 'Schichtübergabe bestätigen',
  handoverDescription: (from: string, to: string) =>
    `Übergabe von ${from} an ${to}. Die Checkliste wird für die nächste Schicht zurückgesetzt.`,
  incompleteWarning: (count: number) => `Noch ${count} optionale Aufgaben offen.`,
  incompleteEssentialWarning: (count: number) =>
    `Noch ${count} Pflichtaufgabe(n) offen — Übergabe blockiert.`,
  confirmLabel: (shift: string) => `Zur Bestätigung „${shift}“ eingeben`,
  cancel: 'Abbrechen',
  handoverConfirm: 'Übergabe bestätigen',
  handoverPending: 'Übergabe…',
  handoverSuccess: 'Schicht erfolgreich übergeben.',
  toggleError: 'Aktion fehlgeschlagen.',
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
    return <p className="p-4 text-sm text-ink-muted">{t.loading}</p>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-danger">{t.loadError}</p>
        <Button type="button" variant="secondary" onClick={() => refetch()}>
          {t.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {toast && (
        <div
          className={clsx(
            'rounded-btn border px-3 py-2 text-sm',
            toast.kind === 'success'
              ? 'border-success/30 bg-success-muted text-success'
              : 'border-warning/30 bg-warning-muted text-warning',
          )}
        >
          {toast.msg}
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t.title}</h2>
        <p className="mt-1 text-xs text-ink-muted">{t.subtitle}</p>
      </div>

      <Card className={clsx('border-2', shiftAccent(data.activeShift))} padding>
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">{t.activeShift}</p>
            <p className="text-xl font-semibold">{data.activeShiftLabel}</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">
              {data.essentialCompletedCount} / {data.essentialTotalCount}
            </p>
            <p className="text-xs opacity-80">
              {t.essentialCompleted(data.essentialCompletedCount, data.essentialTotalCount)}
            </p>
            <p className="mt-0.5 text-[10px] opacity-75 tabular-nums">
              {data.completedCount} / {data.totalCount} {t.completed}
            </p>
          </div>
        </div>
        {data.lastHandoverAt && data.lastHandoverBy && (
          <p className="mt-2 text-[10px] opacity-75">
            {t.lastHandover(
              data.lastHandoverBy.name,
              new Date(data.lastHandoverAt).toLocaleString('de-CH'),
            )}
          </p>
        )}
      </Card>

      <ul className="space-y-2">
        {data.tasks.map((task) => (
          <li key={task.id}>
            <label
              className={clsx(
                'flex min-h-[48px] cursor-pointer items-start gap-2.5 rounded-card border px-3 py-2.5 transition-colors',
                task.completed
                  ? 'border-success/30 bg-success/5'
                  : task.essential
                    ? 'border-action/40 bg-action/5 hover:bg-action/10'
                    : 'border-border bg-surface hover:bg-surface-muted/50',
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-action"
                checked={task.completed}
                disabled={toggleTask.isPending}
                onChange={(e) =>
                  toggleTask.mutate({ taskId: task.id, completed: e.target.checked })
                }
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={clsx('text-sm', task.completed && 'text-ink-muted line-through')}>
                  {task.label}
                </span>
                {task.essential && !task.completed && (
                  <span className="w-fit rounded-full bg-action/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-action">
                    {t.essentialBadge}
                  </span>
                )}
              </span>
              {task.completed && task.completedBy && (
                <span className="shrink-0 text-[10px] text-ink-muted">{task.completedBy.name}</span>
              )}
            </label>
          </li>
        ))}
      </ul>

      {data.tasks.length === 0 && <p className="text-sm text-ink-muted">{t.noTasks}</p>}

      <Button
        type="button"
        variant="primary"
        fullWidth
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3"
          role="dialog"
          aria-modal
          onClick={() => !handover.isPending && setHandoverOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-ink">{t.handoverTitle}</h3>
            <p className="mt-2 text-xs text-ink-muted">
              {t.handoverDescription(data.activeShiftLabel, data.nextShiftLabel)}
            </p>

            {incompleteEssentialCount > 0 && (
              <p className="mt-2 rounded-btn border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {t.incompleteEssentialWarning(incompleteEssentialCount)}
              </p>
            )}

            {incompleteOptionalCount > 0 && essentialComplete && (
              <p className="mt-2 rounded-btn border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {t.incompleteWarning(incompleteOptionalCount)}
              </p>
            )}

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t.confirmLabel(data.nextShiftLabel)}</span>
              <input
                className="min-h-[44px] rounded-btn border border-border bg-surface px-3 text-sm"
                value={confirmName}
                autoComplete="off"
                placeholder={data.nextShiftLabel}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </label>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={handover.isPending}
                onClick={() => setHandoverOpen(false)}
              >
                {t.cancel}
              </Button>
              <Button
                type="button"
                variant="primary"
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
