'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { IconSettings } from '@/components/icons';

type Props = {
  onClick: () => void;
  variant?: 'default' | 'onDark';
};

/** Matches sidebar nav icon tiles (bg-white/5, rounded-md). */
export function SidebarSettingsButton({ onClick, variant = 'onDark' }: Props) {
  const t = useTranslations('profile');

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-panel',
        variant === 'onDark'
          ? 'bg-white/5 text-sidebar-muted hover:bg-white/10 hover:text-white'
          : 'bg-surface-muted text-ink-muted hover:bg-surface-muted/80 hover:text-ink',
      )}
      aria-label={t('openProfile')}
      title={t('openProfile')}
    >
      <IconSettings className="h-[18px] w-[18px]" />
    </button>
  );
}
