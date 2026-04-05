import clsx from 'clsx';

/** Visual treatment for housekeeping-derived status on floor-plan tiles. */
export function roomTileClass(status: string): string {
  return clsx(
    'rounded-lg border-2 px-2 py-2 text-center transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action',
    {
      'border-warning bg-warning-muted/90 text-ink': status === 'OUT_OF_ORDER',
      'border-border bg-surface-muted text-ink': status === 'DIRTY',
      'border-warning/80 bg-warning-muted/60 text-ink': status === 'IN_PROGRESS',
      'border-success/50 bg-success-muted/70 text-ink': status === 'CLEAN',
      'border-action/40 bg-surface text-ink': status === 'INSPECTED',
    },
    !['OUT_OF_ORDER', 'DIRTY', 'IN_PROGRESS', 'CLEAN', 'INSPECTED'].includes(status) &&
      'border-border bg-surface text-ink-muted',
  );
}
