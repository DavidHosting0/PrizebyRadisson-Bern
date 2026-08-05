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
  runNeedsContinue,
  stepLabel,
} from '@/components/reception/arrival-check-run-utils';
import { APP_DARK_CARD } from '@/components/nav/AppPageChrome';

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
  onContinue?: () => void;
  continuePending?: boolean;
  continueError?: string | null;
};

function StatusDot({ status }: { status: ArrivalCheckRunItem['status'] }) {
  const tone = clsx('h-2 w-2 shrink-0 rounded-full', {
    'bg-sidebar-muted/50': status === 'PENDING',
    'animate-pulse bg-indigo-400': status === 'IN_PROGRESS',
    'bg-emerald-400': status === 'COMPLETED',
    'bg-slate-500': status === 'SKIPPED',
    'bg-orange-400': status === 'NEEDS_MANUAL',
    'bg-rose-400': status === 'FAILED',
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
    neutral: 'border-sidebar-border bg-sidebar text-white',
    success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
    warning: 'border-orange-500/30 bg-orange-500/15 text-orange-300',
    danger: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    muted: 'border-sidebar-border/60 bg-white/5 text-sidebar-muted',
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
              done && 'bg-emerald-500/20 text-emerald-300',
              active && !done && 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-400/40',
              !done && !active && 'bg-white/5 text-sidebar-muted',
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
        highlight && 'bg-indigo-500/10',
      )}
    >
      <StatusDot status={item.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-white">{item.mainGuestName ?? '—'}</span>
          {item.roomId && (
            <span className="text-xs text-sidebar-muted">Zi. {item.roomId}</span>
          )}
          <span className="text-xs text-sidebar-muted">{itemStatusLabel(item.status)}</span>
        </div>
        {item.categoryLabel && (
          <p className="mt-0.5 text-xs text-sidebar-muted">{item.categoryLabel}</p>
        )}
        {item.statusMessage && highlight && (
          <p className="mt-1.5 text-xs leading-relaxed text-indigo-200">{item.statusMessage}</p>
        )}
        {item.status === 'IN_PROGRESS' && highlight && <StepPills item={item} />}
        {needsManual(item) && !highlight && (
          <p className="mt-1 text-xs text-orange-300">{manualReasonText(item)}</p>
        )}
      </div>
      {!highlight && item.paymentStatus === 'PAID' && (
        <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
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
  onContinue,
  continuePending,
  continueError,
}: Props) {
  const active = isRunActive(run);
  const paused = runNeedsContinue(run);
  const finished = isRunFinished(run);
  const progressPct = computeProgressPct(run);
  const current = activeItem(run);
  const manualItems = run.items.filter(needsManual);

  const headline = active && !paused
    ? 'Anreise-Check läuft'
    : paused
      ? 'Anreise-Check pausiert'
    : run.status === 'CANCELLED'
      ? 'Anreise-Check abgebrochen'
      : manualItems.length > 0
        ? 'Anreise-Check abgeschlossen'
        : 'Alles erledigt';

  return (
    <div className="w-full min-w-0 space-y-6">
      {!preview && (
        <header className="flex items-center justify-between gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-sidebar-muted hover:text-white"
            >
              ← Zurück
            </button>
          ) : (
            <Link href="/r/arrival-check" className="text-sm text-sidebar-muted hover:text-white">
              ← Zurück
            </Link>
          )}
          {active && run.status === 'RUNNING' && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelPending}
              className="text-sm text-rose-400 hover:text-rose-300 disabled:opacity-50"
            >
              {cancelPending ? 'Wird abgebrochen…' : 'Abbrechen'}
            </button>
          )}
        </header>
      )}

      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">{headline}</h2>
          <p className="mt-1 text-sm text-sidebar-muted">
            {run.itemCount} Reservierung{run.itemCount === 1 ? '' : 'en'}
            {preview && (
              <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                Vorschau
              </span>
            )}
          </p>
        </div>

        {(active || finished) && (
          <div className="space-y-2">
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={clsx(
                  'h-full rounded-full transition-[width] duration-700 ease-out',
                  finished && manualItems.length === 0 && run.status !== 'CANCELLED'
                    ? 'bg-emerald-500'
                    : finished && manualItems.length > 0
                      ? 'bg-orange-500'
                      : 'bg-indigo-400',
                )}
                style={{ width: `${Math.max(progressPct, active ? 2 : 100)}%` }}
              />
            </div>
            <p className="text-sm tabular-nums text-sidebar-muted">{progressPct}%</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <StatChip label="Erledigt" value={run.completedCount} tone="success" />
          <StatChip label="VCC" value={run.paidCount} tone="success" />
          <StatChip label="Manuell" value={run.manualCount} tone="warning" />
          <StatChip label="Fehler" value={run.failedCount} tone="danger" />
          <StatChip label="Abgelehnt" value={run.declinedCount} tone="danger" />
          <StatChip label="Übersprungen" value={run.skippedCount} tone="muted" />
          {active && <StatChip label="Ausstehend" value={run.pendingCount} tone="neutral" />}
        </div>
      </section>

      {paused && onContinue && !preview && (
        <section className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4">
          <p className="text-sm text-indigo-100">
            {run.pendingCount} Reservierung{run.pendingCount === 1 ? '' : 'en'} in der Warteschlange
            — nach einem Neustart oder einer Unterbrechung manuell fortsetzen.
          </p>
          <button
            type="button"
            onClick={onContinue}
            disabled={continuePending}
            className="mt-3 rounded-lg border border-indigo-400/40 bg-sidebar px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {continuePending ? 'Wird fortgesetzt…' : 'Fortsetzen'}
          </button>
        </section>
      )}

      {active && current && (
        <section className={clsx(APP_DARK_CARD, 'overflow-hidden border-indigo-400/30')}>
          <div className="border-b border-indigo-400/20 bg-indigo-500/10 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
              Aktuelle Reservierung
            </p>
          </div>
          <RunItemRow item={current} highlight />
        </section>
      )}

      {run.items.length > 0 && (
        <section className={clsx(APP_DARK_CARD, 'overflow-hidden')}>
          <div className="border-b border-sidebar-border/60 bg-sidebar-hover/40 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-white">
              {active ? 'Warteschlange' : 'Reservierungen'}
            </h3>
          </div>
          <ul className="max-h-[min(480px,50vh)] divide-y divide-sidebar-border/50 overflow-y-auto">
            {run.items.map((item) => (
              <RunItemRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      {finished && run.categoryCounts.length > 0 && (
        <section className={clsx(APP_DARK_CARD, 'p-4')}>
          <h3 className="text-sm font-semibold text-white">Kategorien</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {run.categoryCounts.map((cat) => (
              <span
                key={`${cat.source}-${cat.scenario}`}
                className="rounded-lg border border-sidebar-border/60 bg-sidebar px-3 py-1.5 text-xs"
              >
                <span className="font-medium text-white">{cat.label}</span>
                <span className="ml-1.5 tabular-nums text-sidebar-muted">×{cat.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {finished && (
        <section className="space-y-4">
          {run.status !== 'CANCELLED' && manualItems.length === 0 && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              Keine manuelle Nachbearbeitung nötig.
              {run.completedCount > 0 && (
                <span className="mt-1 block text-emerald-300/80">
                  {run.completedCount} erfolgreich
                  {run.paidCount > 0 ? ` · ${run.paidCount} VCC belastet` : ''}
                  {run.skippedCount > 0 ? ` · ${run.skippedCount} übersprungen` : ''}
                </span>
              )}
            </p>
          )}

          {run.status === 'CANCELLED' && (
            <p className="rounded-xl border border-sidebar-border/60 bg-white/5 px-4 py-3 text-sm text-sidebar-muted">
              Ausstehende Reservierungen wurden nicht verarbeitet.
            </p>
          )}

          {manualItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white">
                Manuelle Bearbeitung nötig ({manualItems.length})
              </h3>
              <ul className={clsx(APP_DARK_CARD, 'divide-y divide-sidebar-border/50 overflow-hidden')}>
                {manualItems.map((item) => (
                  <li key={item.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">
                          {item.mainGuestName ?? '—'}
                          {item.roomId && (
                            <span className="ml-2 font-normal text-sidebar-muted">
                              Zi. {item.roomId}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-sidebar-muted">
                          {item.reservationId}
                        </p>
                        <p
                          className={clsx(
                            'mt-2 text-sm',
                            isDeclinedVcc(item) ? 'text-rose-300' : 'text-orange-300',
                          )}
                        >
                          {manualReasonText(item)}
                        </p>
                        {isDeclinedVcc(item) && (
                          <span className="mt-1 inline-block rounded-full bg-rose-500/20 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                            VCC abgelehnt
                          </span>
                        )}
                      </div>
                      {!preview && (
                        <Link
                          href={`/r/reservations/${item.reservationId}?from=arrivals`}
                          className="shrink-0 rounded-lg border border-sidebar-border px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
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
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
              <p className="text-sm text-rose-200">
                {run.failedCount} Reservierung{run.failedCount === 1 ? '' : 'en'} mit technischem
                Fehler — nach Prüfung erneut versuchen.
              </p>
              <button
                type="button"
                onClick={onRetryFailed}
                disabled={retryFailedPending}
                className="mt-3 rounded-lg border border-rose-400/40 bg-sidebar px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
              >
                {retryFailedPending ? 'Wird wiederholt…' : 'Fehlgeschlagene wiederholen'}
              </button>
            </div>
          )}
        </section>
      )}

      {!active && !finished && (
        <section className="space-y-4 py-6">
          <p className="text-sm text-sidebar-muted">Warte auf Start…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/4 animate-pulse rounded-full bg-indigo-400/40" />
          </div>
        </section>
      )}

      {cancelError && <p className="text-sm text-rose-400">{cancelError}</p>}
      {retryFailedError && <p className="text-sm text-rose-400">{retryFailedError}</p>}
      {continueError && <p className="text-sm text-rose-400">{continueError}</p>}
    </div>
  );
}
