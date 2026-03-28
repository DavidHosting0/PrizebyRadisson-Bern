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
        'rounded-card border border-border bg-surface shadow-card',
        padding && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
