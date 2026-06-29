import clsx from 'clsx';

type Props = {
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ className = '', compact }: Props) {
  return (
    <div className={clsx('flex shrink-0 flex-col', className)}>
      <span
        className={clsx(
          'font-semibold tracking-tight text-ink',
          compact ? 'text-sm' : 'text-base',
        )}
      >
        Prize by Radisson
      </span>
      <span className={clsx('font-medium text-action', compact ? 'text-xs' : 'text-sm')}>
        Bern
      </span>
    </div>
  );
}
