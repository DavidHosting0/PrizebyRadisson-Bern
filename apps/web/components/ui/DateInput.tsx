'use client';

import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';

type DateInputType = 'date' | 'datetime-local' | 'month' | 'time';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  type?: DateInputType;
  /** Visual density. Default `md`. */
  size?: 'sm' | 'md';
};

/**
 * Native date / datetime control styled to the dark-blue (sidebar) theme.
 * Calendar icon + light picker indicator; use everywhere instead of bare `type="date"`.
 */
export function DateInput({
  type = 'date',
  size = 'md',
  className,
  disabled,
  ...rest
}: Props) {
  return (
    <div
      className={clsx(
        'date-input-shell relative inline-flex w-full min-w-0 items-center',
        disabled && 'opacity-60',
      )}
    >
      <span
        className={clsx(
          'pointer-events-none absolute left-3 z-[1] text-sidebar-muted',
          size === 'sm' ? 'left-2.5' : 'left-3',
        )}
        aria-hidden
      >
        <CalendarGlyph size={size === 'sm' ? 14 : 16} />
      </span>
      <input
        type={type}
        disabled={disabled}
        className={clsx(
          'date-input w-full min-w-0 appearance-none rounded-xl border font-medium tabular-nums transition',
          'border-sidebar-border bg-sidebar text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
          'placeholder:text-sidebar-muted',
          'hover:border-[#3b5170] hover:bg-sidebar-hover',
          'focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30',
          'disabled:cursor-not-allowed',
          size === 'sm' ? 'min-h-[36px] py-1.5 pl-9 pr-2.5 text-xs' : 'min-h-[44px] py-2 pl-10 pr-3 text-sm',
          className,
        )}
        {...rest}
      />
    </div>
  );
}

function CalendarGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15.5"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
