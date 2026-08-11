'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';

export function PriorityBadge({
  priority,
  tone = 'default',
}: {
  priority: string;
  tone?: 'default' | 'dark';
}) {
  const t = useTranslations('notifications');
  const urgent = priority === 'URGENT';
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'dark'
          ? urgent
            ? 'bg-red-500/25 text-red-200'
            : 'bg-white/10 text-sidebar-muted'
          : urgent
            ? 'bg-danger-muted text-danger'
            : 'bg-surface-muted text-ink-muted',
      )}
    >
      {urgent ? t('priorityUrgent') : t('priorityNormal')}
    </span>
  );
}
