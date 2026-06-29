'use client';

import Link from 'next/link';
import clsx from 'clsx';
import type { ArrivalCheckRunDetail, ArrivalCheckRunItem } from '@housekeeping/shared';
import {
  activeItem,
  computeProgressPct,
  isDeclinedVcc,
  isRunActive,
  isRunFinished,
  itemStatusLabel,
  manualReasonText,
  needsManual,
  stepLabel,
} from '@/components/reception/arrival-check-run-utils';

type Props = {
  run: ArrivalCheckRunDetail;
  /** Hide back/cancel controls (admin preview embed). */
  preview?: boolean;
  onBack?: () => void;
  onCancel?: () => void;
  cancelPending?: boolean;
  cancelError?: string | null;
  onRetryFailed?: () => void;
  retryFailedPending?: boolean;
  retryFailedError?: string | null;
};

function StatusDot({ status }: { status: ArrivalCheckRunItem['status'] }) {
  const tone = clsx('h-2 w-2 shrink-0 rounded-full', {
    'bg-ink/25': status === 'PENDING',
    'animate-pulse bg-indigo-500': status === 'IN_PROGRESS',
    'bg-emerald-500': status === 'COMPLETED',
    'bg-slate-400': status === 'SKIPPED',
    'bg-orange-500': status === 'NEEDS_MANUAL',
    'bg-rose-500': status === 'FAILED',
  });
  return <span className={tone} aria-hidden />;
}

function StatChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  if (value === 0) return null;
  const styles = {
    neutral: 'border-border bg-surface text-ink',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-orange-200 bg-orange-50 text-orange-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    muted: 'border-border bg-surface-muted/60 text-ink-muted',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums',
        styles[tone],
      )}
    >
      <span className="text-[11px] uppercase tracking-wide opacity-70">{label}</span>
      {value}
    </span>
  );
}

function StepPills({ item }: { item: ArrivalCheckRunItem }) {
  const steps: ArrivalCheckRunItem['currentStep'][] = [
    'FOLIO_LOAD',
    'CHARGE_ASSIGN',
    'PREPAID_SETTLE',
  ];
  const showPayment = item.scenario === 'VCC';
  const visible = showPayment ? steps : steps.slice(0, 2);
  const currentIdx = item.currentStep ? visible.indexOf(item.currentStep) : -1;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {visible.map((step, idx) => {
        const done = item.status === 'COMPLETED' || (currentIdx >= 0 && idx < currentIdx);
        const active = item.currentStep === step;
        return (
          <span
            key={step}
            className={clsx(
              'rounded-md px-2 py-0.5 text-[11px] font-medium',
              done && 'bg-emerald-100 text-emerald-800',
              active && !done && 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-200',
              !done && !active && 'bg-surface-muted text-ink-muted',
            )}
          >
            {stepLabel(step)}
          </span>
        );
      })}
    </div>
  );
}

function RunItemRow({ item, highlight }: { item: ArrivalCheckRunItem; highlight?: boolean }) {
  return (
    <li
      className={clsx(
        'flex items-start gap-3 px-4 py-3 text-sm transition-colors',
        highlight && 'bg-indigo-50/80',
      )}
    >
      <StatusDot status={item.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-ink">{item.mainGuestName ?? '—'}</span>
          {item.roomId && (
            <span className="text-xs text-ink-muted">Zi. {item.roomId}</span>
          )}
          <span className="text-xs text-ink-muted">{itemStatusLabel(item.status)}</span>
        </div>
        {item.categoryLabel && (
          <p className="mt-0.5 text-xs text-ink-muted">{item.categoryLabel}</p>
        )}
        {item.statusMessage && highlight && (
          <p className="mt-1.5 text-xs leading-relaxed text-indigo-900">{item.statusMessage}</p>
        )}
        {item.status === 'IN_PROGRESS' && highlight && <StepPills item={item} />}
        {needsManual(item) && !highlight && (
          <p className="mt-1 text-xs text-orange-800">{manualReasonText(item)}</p>
        )}
      </div>
      {!highlight && item.paymentStatus === 'PAID' && (
        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
          VCC
        </span>
      )}
    </li>
  );
}

export function ArrivalCheckRunView({
  run,
  preview = false,
  onBack,
  onCancel,
  cancelPending,
  cancelError,
  onRetryFailed,
  retryFailedPending,
  retryFailedError,
}: Props) {
  const active = isRunActive(run);
  const finished = isRunFinished(run);
  const progressPct = computeProgressPct(run);
  const current = activeItem(run);
  const manualItems = run.items.filter(needsManual);

  const headline = active
    ? 'Anreise-Check läuft'
    : run.status === 'CANCELLED'
      ? 'Anreise-Check abgebrochen'
      : manualItems.length > 0
        ? 'Anreise-Check abgeschlossen'
        : 'Alles erledigt';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {!preview && (
        <header className="flex items-center justify-between gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-ink-muted hover:text-ink"
            >
              ← Zurück
            </button>
          ) : (
            <Link href="/r/arrival-check" className="text-sm text-ink-muted hover:text-ink">
              ← Zurück
            </Link>
          )}
          {active && run.status === 'RUNNING' && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelPending}
              className="text-sm text-rose-700 hover:text-rose-900 disabled:opacity-50"
            >
              {cancelPending ? 'Wird abgebrochen…' : 'Abbrechen'}
            </button>
          )}
        </header>
      )}

      <section className="space-y-5">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{headline}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {run.itemCount} Reservierung{run.itemCount === 1 ? '' : 'en'}
            {preview && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                Vorschau
              </span>
            )}
          </p>
        </div>

        {(active || finished) && (
          <div className="space-y-2">
            <div className="h-3 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className={clsx(
                  'h-full rounded-full transition-[width] duration-700 ease-out',
                  finished && manualItems.length === 0 && run.status !== 'CANCELLED'
                    ? 'bg-emerald-600'
                    : finished && manualItems.length > 0
                      ? 'bg-orange-500'
                      : 'bg-ink',
                )}
                style={{ width: `${Math.max(progressPct, active ? 2 : 100)}%` }}
              />
            </div>
            <p className="text-center text-sm tabular-nums text-ink-muted">{progressPct}%</p>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          <StatChip label="Erledigt" value={run.completedCount} tone="success" />
          <StatChip label="VCC" value={run.paidCount} tone="success" />
          <StatChip label="Manuell" value={run.manualCount} tone="warning" />
          <StatChip label="Fehler" value={run.failedCount} tone="danger" />
          <StatChip label="Abgelehnt" value={run.declinedCount} tone="danger" />
          <StatChip label="Übersprungen" value={run.skippedCount} tone="muted" />
          {active && <StatChip label="Ausstehend" value={run.pendingCount} tone="neutral" />}
        </div>
      </section>

      {active && current && (
        <section className="overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/50 shadow-sm">
          <div className="border-b border-indigo-100 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Aktuelle Reservierung
            </p>
          </div>
          <RunItemRow item={current} highlight />
        </section>
      )}

      {run.items.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <div className="border-b border-border bg-surface-muted/30 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-ink">
              {active ? 'Warteschlange' : 'Reservierungen'}
            </h2>
          </div>
          <ul className="divide-y divide-border max-h-[320px] overflow-y-auto">
            {run.items.map((item) => (
              <RunItemRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      {finished && run.categoryCounts.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Kategorien</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {run.categoryCounts.map((cat) => (
              <span
                key={`${cat.source}-${cat.scenario}`}
                className="rounded-lg border border-border bg-surface-muted/40 px-3 py-1.5 text-xs"
              >
                <span className="font-medium text-ink">{cat.label}</span>
                <span className="ml-1.5 tabular-nums text-ink-muted">×{cat.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {finished && (
        <section className="space-y-4">
          {run.status !== 'CANCELLED' && manualItems.length === 0 && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-900">
              Keine manuelle Nachbearbeitung nötig.
              {run.completedCount > 0 && (
                <span className="mt-1 block text-emerald-800/80">
                  {run.completedCount} erfolgreich
                  {run.paidCount > 0 ? ` · ${run.paidCount} VCC belastet` : ''}
                  {run.skippedCount > 0 ? ` · ${run.skippedCount} übersprungen` : ''}
                </span>
              )}
            </p>
          )}

          {run.status === 'CANCELLED' && (
            <p className="rounded-xl border border-border bg-surface-muted/50 px-4 py-3 text-center text-sm text-ink-muted">
              Ausstehende Reservierungen wurden nicht verarbeitet.
            </p>
          )}

          {manualItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ink">
                Manuelle Bearbeitung nötig ({manualItems.length})
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-card">
                {manualItems.map((item) => (
                  <li key={item.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          {item.mainGuestName ?? '—'}
                          {item.roomId && (
                            <span className="ml-2 font-normal text-ink-muted">
                              Zi. {item.roomId}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                          {item.reservationId}
                        </p>
                        <p
                          className={clsx(
                            'mt-2 text-sm',
                            isDeclinedVcc(item) ? 'text-rose-800' : 'text-orange-800',
                          )}
                        >
                          {manualReasonText(item)}
                        </p>
                        {isDeclinedVcc(item) && (
                          <span className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-900">
                            VCC abgelehnt
                          </span>
                        )}
                      </div>
                      {!preview && (
                        <Link
                          href={`/r/reservations/${item.reservationId}?from=arrivals`}
                          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
                        >
                          Öffnen
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {finished && run.failedCount > 0 && onRetryFailed && !preview && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-center">
              <p className="text-sm text-rose-900">
                {run.failedCount} Reservierung{run.failedCount === 1 ? '' : 'en'} mit technischem
                Fehler — nach Prüfung erneut versuchen.
              </p>
              <button
                type="button"
                onClick={onRetryFailed}
                disabled={retryFailedPending}
                className="mt-3 rounded-lg border border-rose-300 bg-surface px-4 py-2 text-sm font-semibold text-rose-950 hover:bg-rose-50 disabled:opacity-50"
              >
                {retryFailedPending ? 'Wird wiederholt…' : 'Fehlgeschlagene wiederholen'}
              </button>
            </div>
          )}
        </section>
      )}

      {!active && !finished && (
        <section className="space-y-4 py-6 text-center">
          <p className="text-sm text-ink-muted">Warte auf Start…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full w-1/4 animate-pulse rounded-full bg-ink/20" />
          </div>
        </section>
      )}

      {cancelError && (
        <p className="text-sm text-rose-700">{cancelError}</p>
      )}

      {retryFailedError && (
        <p className="text-sm text-rose-700">{retryFailedError}</p>
      )}
    </div>
  );
}
