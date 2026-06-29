'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { type SupportedLocale } from '@housekeeping/shared';
import { useLocale } from '@/lib/locale-context';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  const t = useTranslations('common');

  const options: { value: SupportedLocale; label: string }[] = [
    { value: 'de', label: 'DE' },
    { value: 'en', label: 'EN' },
  ];

  return (
    <div
      className={clsx('flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5', compact && 'text-xs')}
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
              ? 'bg-ink text-surface'
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
