'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';

const style: Record<string, string> = {
  OUT_OF_ORDER: 'bg-warning-muted text-warning',
  DIRTY: 'bg-surface-muted text-ink-muted',
  IN_PROGRESS: 'bg-warning-muted/80 text-ink',
  CLEAN: 'bg-success-muted text-success',
  INSPECTED: 'bg-surface-muted text-ink',
};

const STATUS_KEYS = [
  'OUT_OF_ORDER',
  'DIRTY',
  'IN_PROGRESS',
  'CLEAN',
  'INSPECTED',
] as const;

export function roomStatusLabel(status: string, t: (key: string) => string): string {
  if ((STATUS_KEYS as readonly string[]).includes(status)) {
    return t(`room.status.${status}`);
  }
  return status.replace(/_/g, ' ');
}

export function StatusBadge({
  status,
  variant = 'default',
}: {
  status: string;
  /** Readable on saturated status-colored tiles (floor plan). */
  variant?: 'default' | 'onColor';
}) {
  const t = useTranslations();
  const label = roomStatusLabel(status, (key) => t(key as 'room.status.DIRTY'));

  if (variant === 'onColor') {
    return (
      <span className="inline-flex rounded-full border border-white/30 bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-[2px]">
        {label}
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
      {label}
    </span>
  );
}
