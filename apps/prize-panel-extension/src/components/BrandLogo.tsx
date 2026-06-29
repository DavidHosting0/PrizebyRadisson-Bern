import clsx from 'clsx';

type Props = {
  className?: string;
  compact?: boolean;
  onDark?: boolean;
};

export function BrandLogo({ className = '', compact, onDark }: Props) {
  return (
    <div className={clsx('flex shrink-0 items-center gap-1.5', className)}>
      <span
        className={clsx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
          onDark ? 'bg-action text-white' : 'bg-sidebar text-white',
        )}
        aria-hidden
      >
        PB
      </span>
      {!compact && (
        <span
          className={clsx(
            'text-xs font-semibold leading-tight',
            onDark ? 'text-white' : 'text-ink',
          )}
        >
          PrizeBern
        </span>
      )}
    </div>
  );
}
