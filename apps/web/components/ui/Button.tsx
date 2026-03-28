import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-ink text-white shadow-sm hover:bg-ink/90 active:bg-ink/95 disabled:opacity-50',
  secondary:
    'bg-surface text-ink border border-border shadow-card hover:bg-surface-muted active:bg-surface-muted/80',
  danger: 'bg-danger-muted text-danger border border-danger/20 hover:bg-danger/10',
  ghost: 'text-ink-muted hover:bg-surface-muted/80',
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
        'inline-flex min-h-[48px] items-center justify-center rounded-btn px-4 py-3 text-sm font-medium transition-colors duration-tap tap-scale',
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
