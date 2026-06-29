'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';

const style: Record<string, string> = {
  DIRTY: 'border border-red-900/25 bg-red-600/15 text-red-900',
  CLEAN: 'border border-orange-900/20 bg-orange-500/15 text-orange-950',
  INSPECTED: 'border border-emerald-900/25 bg-emerald-600/15 text-emerald-900',
  IN_PROGRESS: 'border border-amber-800/30 bg-amber-400/25 text-amber-950',
  OUT_OF_ORDER: 'border border-violet-950/30 bg-violet-600/15 text-violet-900',
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
