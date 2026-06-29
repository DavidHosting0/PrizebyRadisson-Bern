import clsx from 'clsx';

type Props = {
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ className = '', compact }: Props) {
  return (
    <div className={clsx('flex shrink-0 items-center gap-1.5', className)}>
      <span
        className={clsx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-action text-[10px] font-bold text-white',
        )}
        aria-hidden
      >
        PB
      </span>
      {!compact && (
        <span className="text-xs font-semibold leading-tight text-ink">
          PrizeBern
        </span>
      )}
    </div>
  );
}
