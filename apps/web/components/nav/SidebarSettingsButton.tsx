'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { IconSettings } from '@/components/icons';

type Props = {
  onClick: () => void;
  variant?: 'default' | 'onDark';
};

export function SidebarSettingsButton({ onClick, variant = 'onDark' }: Props) {
  const t = useTranslations('profile');

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg transition',
        variant === 'onDark'
          ? 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'
          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
      )}
      aria-label={t('openProfile')}
      title={t('openProfile')}
    >
      <IconSettings className="h-5 w-5" />
    </button>
  );
}
