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

export function StatusBadge({
  status,
  variant = 'default',
}: {
  status: string;
  /** Readable on saturated status-colored tiles (floor plan). */
  variant?: 'default' | 'onColor';
}) {
  if (variant === 'onColor') {
    return (
      <span className="inline-flex rounded-full border border-white/30 bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-[2px]">
        {LABEL[status] ?? status.replace(/_/g, ' ')}
      </span>
    );
  }
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
