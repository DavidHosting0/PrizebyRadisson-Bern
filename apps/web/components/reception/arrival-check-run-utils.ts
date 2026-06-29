import type { ArrivalCheckRunDetail, ArrivalCheckRunItem } from '@housekeeping/shared';

export function needsManual(item: ArrivalCheckRunItem): boolean {
  return item.status === 'NEEDS_MANUAL' || item.status === 'FAILED';
}

export function isDeclinedVcc(item: ArrivalCheckRunItem): boolean {
  return item.paymentStatus === 'DECLINED';
}

export function manualReasonText(item: ArrivalCheckRunItem): string {
  return item.manualReason ?? item.paymentError ?? item.error ?? 'Manuelle Prüfung erforderlich.';
}

/** True while the backend may still be processing — keep polling. */
export function isRunActive(run: ArrivalCheckRunDetail | undefined): boolean {
  if (!run) return true;
  if (run.items.some((i) => i.status === 'IN_PROGRESS')) return true;
  if (run.status === 'RUNNING' && run.pendingCount > 0) return true;
  if (
    run.status !== 'COMPLETED' &&
    run.status !== 'FAILED' &&
    run.status !== 'CANCELLED' &&
    run.pendingCount > 0
  ) {
    return true;
  }
  return false;
}

/** Run was interrupted (e.g. API restart) and has queue items waiting for explicit continue. */
export function runNeedsContinue(run: ArrivalCheckRunDetail): boolean {
  return (
    run.status === 'RUNNING' &&
    run.pendingCount > 0 &&
    !run.items.some((i) => i.status === 'IN_PROGRESS')
  );
}

export function isRunFinished(run: ArrivalCheckRunDetail): boolean {
  return run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED';
}

/** Progress 0–100 including partial credit for the reservation currently in progress. */
export function computeProgressPct(run: ArrivalCheckRunDetail): number {
  if (run.itemCount === 0) return 0;
  const weight = 1 / run.itemCount;
  let total = 0;
  for (const item of run.items) {
    if (item.status === 'IN_PROGRESS') {
      total += weight * inProgressFraction(item);
    } else if (
      item.status === 'COMPLETED' ||
      item.status === 'SKIPPED' ||
      item.status === 'NEEDS_MANUAL' ||
      item.status === 'FAILED'
    ) {
      total += weight;
    }
  }
  return Math.min(100, Math.round(total * 100));
}

export function inProgressFraction(item: ArrivalCheckRunItem): number {
  switch (item.currentStep) {
    case 'PREPAID_SETTLE':
      return 0.9;
    case 'CHARGE_ASSIGN':
      if (item.movesPlanned > 0) {
        return 0.25 + (0.55 * item.movesDone) / item.movesPlanned;
      }
      return 0.45;
    case 'FOLIO_LOAD':
      return 0.12;
    default:
      return 0.08;
  }
}

export function activeItem(run: ArrivalCheckRunDetail): ArrivalCheckRunItem | null {
  return run.items.find((i) => i.status === 'IN_PROGRESS') ?? null;
}

export function stepLabel(step: ArrivalCheckRunItem['currentStep']): string {
  switch (step) {
    case 'FOLIO_LOAD':
      return 'Folio laden';
    case 'CHARGE_ASSIGN':
      return 'Posten verschieben';
    case 'PREPAID_SETTLE':
      return 'VCC belasten';
    default:
      return 'Vorbereitung';
  }
}

export function itemStatusLabel(status: ArrivalCheckRunItem['status']): string {
  switch (status) {
    case 'PENDING':
      return 'Ausstehend';
    case 'IN_PROGRESS':
      return 'In Bearbeitung';
    case 'COMPLETED':
      return 'Erledigt';
    case 'SKIPPED':
      return 'Übersprungen';
    case 'NEEDS_MANUAL':
      return 'Manuell';
    case 'FAILED':
      return 'Fehlgeschlagen';
    default:
      return status;
  }
}
