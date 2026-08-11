'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import {
  localeAbbrev,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@housekeeping/shared';
import { useLocale } from '@/lib/locale-context';
import { LocaleFlag } from '@/components/i18n/LocaleFlag';

const LOCALE_META: Record<SupportedLocale, { name: string }> = {
  de: { name: 'Deutsch' },
  en: { name: 'English' },
  pt: { name: 'Português' },
  es: { name: 'Español' },
  tr: { name: 'Türkçe' },
  uk: { name: 'Українська' },
};

export function LanguageSwitcher({
  compact = false,
  onDark = false,
  /** Larger tap target for mobile headers (housekeeper / technician). */
  touch = false,
}: {
  compact?: boolean;
  onDark?: boolean;
  touch?: boolean;
}) {
  const { locale, setLocale } = useLocale();
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const updateMenuPos = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onDocPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onReposition() {
      updateMenuPos();
    }
    function onScroll() {
      // Keep menu aligned while page scrolls; close if trigger leaves viewport.
      const btn = buttonRef.current;
      if (!btn) {
        setOpen(false);
        return;
      }
      const rect = btn.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      updateMenuPos();
    }

    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    // Capture scroll from any scroll container (AppPageBody, header, etc.)
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const menu =
    open &&
    menuPos &&
    typeof document !== 'undefined' &&
    createPortal(
      <ul
        ref={menuRef}
        role="listbox"
        aria-label={t('language')}
        style={{ top: menuPos.top, right: menuPos.right }}
        className={clsx(
          'fixed z-[200] min-w-[11rem] overflow-hidden rounded-lg border py-1 shadow-lift',
          onDark
            ? 'border-sidebar-border bg-[#1A2332] text-white'
            : 'border-border bg-surface text-ink',
        )}
      >
        {SUPPORTED_LOCALES.map((code) => {
          const opt = LOCALE_META[code];
          const active = locale === code;
          return (
            <li key={code} role="option" aria-selected={active}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (code !== locale) void setLocale(code);
                }}
                className={clsx(
                  'flex w-full items-center gap-2 px-3 text-left text-sm transition-colors',
                  touch ? 'min-h-[44px] py-2.5' : 'py-2',
                  active
                    ? onDark
                      ? 'bg-white/15 font-semibold'
                      : 'bg-surface-muted font-semibold'
                    : onDark
                      ? 'hover:bg-white/10'
                      : 'hover:bg-surface-muted',
                )}
              >
                <LocaleFlag
                  locale={code}
                  className="h-3.5 w-[21px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
                />
                <span className="tabular-nums tracking-wide">{localeAbbrev(code)}</span>
                <span
                  className={clsx(
                    'ml-auto text-xs',
                    onDark ? 'text-sidebar-muted' : 'text-ink-muted',
                  )}
                >
                  {opt.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>,
      document.body,
    );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-lg border font-semibold transition-colors',
          touch
            ? 'min-h-[44px] gap-2 px-3 py-2 text-sm'
            : compact
              ? 'min-h-[28px] px-2 py-1 text-xs font-medium'
              : 'min-h-[36px] px-2.5 py-1.5 text-sm font-medium',
          onDark
            ? 'border-sidebar-border bg-white/10 text-white hover:bg-white/15'
            : 'border-border bg-surface text-ink hover:bg-surface-muted',
        )}
        aria-label={t('language')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <LocaleFlag
          locale={locale}
          className={clsx(
            'shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)]',
            touch ? 'h-4 w-6' : 'h-3.5 w-[21px]',
          )}
        />
        <span className="tabular-nums tracking-wide">{localeAbbrev(locale)}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          aria-hidden
          className={clsx(
            'opacity-70 transition-transform',
            open && 'rotate-180',
            onDark ? 'text-sidebar-muted' : 'text-ink-muted',
          )}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {menu}
    </div>
  );
}
