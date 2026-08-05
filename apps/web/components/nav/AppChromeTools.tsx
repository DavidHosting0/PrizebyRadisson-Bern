'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { CommandPaletteTrigger } from '@/components/command/CommandPaletteTrigger';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

/** Shared desktop tools for dark AppPageChrome actions (s/r/a). */
export function AppChromeTools({
  onEnterMobile,
  mobileLabel = 'Mobile view',
  commandLabel,
}: {
  onEnterMobile?: () => void;
  mobileLabel?: string;
  commandLabel?: string;
}) {
  return (
    <div className="hidden items-center gap-2 md:flex">
      <CommandPaletteTrigger
        onDark
        className="min-h-[40px] gap-2 px-3 text-xs"
        label={commandLabel}
      />
      <LanguageSwitcher compact onDark />
      {onEnterMobile ? (
        <Button
          type="button"
          variant="ghost"
          className="min-h-[40px] border border-sidebar-border bg-transparent px-3 text-xs text-sidebar-muted hover:bg-white/10 hover:text-white"
          onClick={onEnterMobile}
        >
          {mobileLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function AppChromeActionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[40px] items-center rounded-btn border border-sidebar-border bg-sidebar-hover px-3 text-sm font-medium text-white transition hover:bg-white/10"
    >
      {children}
    </Link>
  );
}
