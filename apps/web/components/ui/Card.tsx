import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({
  children,
  className,
  padding = true,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  /** `dark` = sidebar-tinted surface for mobile housekeeper / dark shells. */
  tone?: 'default' | 'dark';
}) {
  return (
    <div
      className={clsx(
        'rounded-card transition-shadow duration-panel',
        tone === 'dark'
          ? 'border border-sidebar-border/70 bg-sidebar text-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
          : 'border border-border/80 bg-surface text-ink shadow-card hover:shadow-[0_2px_8px_rgba(26,35,50,0.06)]',
        padding && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
