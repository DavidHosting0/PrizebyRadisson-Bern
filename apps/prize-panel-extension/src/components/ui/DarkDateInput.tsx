import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';

type DateInputType = 'date' | 'datetime-local' | 'month' | 'time';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type?: DateInputType;
  size?: 'sm' | 'md';
};

/** Dark-blue date field matching DarkSelect / sidebar theme (extension panel). */
export function DarkDateInput({
  type = 'date',
  size = 'sm',
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
          'pointer-events-none absolute z-[1] text-sidebar-muted',
          size === 'sm' ? 'left-2' : 'left-2.5',
        )}
        aria-hidden
      >
        <svg
          width={size === 'sm' ? 12 : 14}
          height={size === 'sm' ? 12 : 14}
          viewBox="0 0 24 24"
          fill="none"
        >
          <rect
            x="3.5"
            y="5"
            width="17"
            height="15.5"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M8 3.5v3M16 3.5v3M3.5 10h17"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <input
        type={type}
        disabled={disabled}
        className={clsx(
          'date-input w-full min-w-0 appearance-none rounded-xl border font-medium tabular-nums transition',
          'border-white/15 bg-white/[0.05] text-slate-100',
          'hover:border-white/25 hover:bg-white/[0.08]',
          'focus:border-sky-400/45 focus:outline-none focus:ring-1 focus:ring-sky-400/25',
          'disabled:cursor-not-allowed',
          size === 'sm' ? 'min-h-[34px] py-1 pl-7 pr-1.5 text-[10px]' : 'min-h-[40px] py-1.5 pl-9 pr-2.5 text-[11px]',
          className,
        )}
        {...rest}
      />
    </div>
  );
}
