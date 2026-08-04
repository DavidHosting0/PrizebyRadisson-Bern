import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { ShiftHandoverStateDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

const t = {
  title: 'To-Do-Liste',
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
  if (shift === 'NIGHT') return 'border-indigo-400/40 bg-indigo-500/15 text-indigo-100';
  if (shift === 'MORNING') return 'border-amber-400/40 bg-amber-500/15 text-amber-100';
  return 'border-sky-400/40 bg-sky-500/15 text-sky-100';
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
    return <p className="bg-sidebar p-3 text-xs text-sidebar-muted">{t.loading}</p>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-2 bg-sidebar p-3">
        <p className="text-xs text-danger">{t.loadError}</p>
        <Button type="button" variant="secondary" className="min-h-[30px]" onClick={() => refetch()}>
          {t.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="shrink-0 border-b border-sidebar-border px-2.5 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-sidebar-muted">
          {(() => {
            const [y, m, d] = data.activeDate.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('de-CH', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
          })()}
        </p>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-300">{t.title}</h2>
        <p className="mt-0.5 text-sm font-semibold text-white">{data.activeShiftLabel}</p>
        {data.nextHandoverAdvancesDay && (
          <p className="mt-0.5 text-[9px] text-sidebar-muted">
            Nächste Übergabe → neuer Tag ({data.nextShiftLabel})
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-2.5 pb-3">
        {toast && (
          <div
            className={clsx(
              'rounded-md border px-2 py-1.5 text-[11px]',
              toast.kind === 'success'
                ? 'border-success/40 bg-success/15 text-emerald-200'
                : 'border-warning/40 bg-warning/15 text-amber-200',
            )}
          >
            {toast.msg}
          </div>
        )}

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
                  'flex cursor-pointer items-start gap-2 rounded-xl border px-2 py-1.5 transition-colors',
                  task.completed
                    ? 'border-emerald-400/25 bg-emerald-500/10'
                    : task.essential
                      ? 'border-sky-400/35 bg-sky-500/10 hover:bg-sky-500/15'
                      : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/20 accent-sky-400"
                  checked={task.completed}
                  disabled={toggleTask.isPending}
                  onChange={(e) =>
                    toggleTask.mutate({ taskId: task.id, completed: e.target.checked })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      'block text-xs leading-snug text-slate-100',
                      task.completed && 'text-sidebar-muted line-through',
                    )}
                  >
                    {task.label}
                  </span>
                  {task.essential && !task.completed && (
                    <span className="mt-0.5 inline-block rounded bg-sky-400/20 px-1 py-px text-[8px] font-semibold uppercase text-sky-200">
                      {t.essentialBadge}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>

        {data.tasks.length === 0 && <p className="text-xs text-sidebar-muted">{t.noTasks}</p>}

        <Button
          type="button"
          variant="action"
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
      </div>

      {handoverOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/55 p-2"
          role="dialog"
          aria-modal
          onClick={() => !handover.isPending && setHandoverOpen(false)}
        >
          <div
            className="w-full rounded-2xl border border-white/10 bg-sidebar p-3 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xs font-semibold text-white">{t.handoverTitle}</h3>
            <p className="mt-1 text-[11px] text-sidebar-muted">
              {t.handoverDescription(data.activeShiftLabel, data.nextShiftLabel)}
            </p>

            {incompleteEssentialCount > 0 && (
              <p className="mt-1.5 rounded-md border border-danger/40 bg-danger/15 px-2 py-1 text-[11px] text-red-200">
                {t.incompleteEssentialWarning(incompleteEssentialCount)}
              </p>
            )}

            {incompleteOptionalCount > 0 && essentialComplete && (
              <p className="mt-1.5 rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[11px] text-amber-100">
                {t.incompleteWarning(incompleteOptionalCount)}
              </p>
            )}

            <label className="mt-2 flex flex-col gap-0.5">
              <span className="text-[10px] text-sidebar-muted">{t.confirmLabel(data.nextShiftLabel)}</span>
              <input
                className="min-h-[34px] rounded-lg border border-white/15 bg-white/5 px-2 text-xs text-white placeholder:text-sidebar-muted"
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
                variant="action"
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
