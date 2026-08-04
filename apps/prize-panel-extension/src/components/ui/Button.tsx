import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'action';

/** Dark-panel friendly variants — hover never washes out to light/white. */
const styles: Record<Variant, string> = {
  primary:
    'bg-sidebar-hover text-white border border-white/10 hover:bg-[#2c3b52] active:bg-[#334560] disabled:opacity-50',
  action:
    'bg-action text-white shadow-sm hover:bg-[#4a82b5] active:bg-[#3570a0] disabled:opacity-50',
  secondary:
    'border border-white/15 bg-white/[0.06] text-slate-100 hover:bg-white/[0.12] hover:border-white/25 active:bg-white/[0.16] disabled:opacity-50',
  danger:
    'border border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25 active:bg-red-500/30 disabled:opacity-50',
  ghost:
    'text-sidebar-muted border border-transparent hover:bg-white/10 hover:text-white disabled:opacity-50',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
  fullWidth?: boolean;
};

export function Button({
  variant = 'primary',
  fullWidth,
  className,
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex min-h-[34px] items-center justify-center rounded-btn px-3 py-1.5 text-xs font-medium transition-colors duration-tap',
        styles[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
