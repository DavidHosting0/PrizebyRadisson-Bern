import clsx from 'clsx';

const LABEL: Record<string, string> = {
  OUT_OF_ORDER: 'Out of order',
  DIRTY: 'Dirty',
  IN_PROGRESS: 'In progress',
  CLEAN: 'Clean',
  INSPECTED: 'Inspected',
};

const style: Record<string, string> = {
  OUT_OF_ORDER: 'bg-warning-muted text-warning',
  DIRTY: 'bg-surface-muted text-ink-muted',
  IN_PROGRESS: 'bg-warning-muted/80 text-ink',
  CLEAN: 'bg-success-muted text-success',
  INSPECTED: 'bg-surface-muted text-ink',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
        style[status] ?? 'bg-surface-muted text-ink-muted',
      )}
    >
      {LABEL[status] ?? status.replace(/_/g, ' ')}
    </span>
  );
}
