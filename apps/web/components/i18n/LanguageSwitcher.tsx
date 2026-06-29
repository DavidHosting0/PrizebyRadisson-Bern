'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { type SupportedLocale } from '@housekeeping/shared';
import { useLocale } from '@/lib/locale-context';

export function LanguageSwitcher({
  compact = false,
  onDark = false,
}: {
  compact?: boolean;
  onDark?: boolean;
}) {
  const { locale, setLocale } = useLocale();
  const t = useTranslations('common');

  const options: { value: SupportedLocale; label: string }[] = [
    { value: 'de', label: 'DE' },
    { value: 'en', label: 'EN' },
  ];

  return (
    <div
      className={clsx(
        'flex items-center gap-0.5 rounded-lg border p-0.5',
        compact && 'text-xs',
        onDark ? 'border-sidebar-border bg-white/5' : 'border-border bg-surface',
      )}
      role="group"
      aria-label={t('language')}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => void setLocale(opt.value)}
          className={clsx(
            'min-h-[28px] rounded-md px-2 py-1 font-medium transition-colors',
            locale === opt.value
              ? onDark
                ? 'bg-white/15 text-white'
                : 'bg-ink text-surface'
              : onDark
                ? 'text-sidebar-muted hover:text-white'
                : 'text-ink-muted hover:text-ink',
          )}
          aria-pressed={locale === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
