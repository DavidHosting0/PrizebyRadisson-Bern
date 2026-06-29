import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-card border border-border/80 bg-surface shadow-card transition-shadow duration-panel hover:shadow-[0_2px_8px_rgba(26,35,50,0.06)]',
        padding && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
