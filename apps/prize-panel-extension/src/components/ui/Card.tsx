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
        'rounded-xl border border-white/10 bg-white/[0.06] text-slate-100 shadow-none',
        padding && 'p-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
