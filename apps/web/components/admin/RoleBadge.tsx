import clsx from 'clsx';

export function RoleBadge({
  name,
  color,
  compact,
  className,
}: {
  name: string;
  color: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 rounded-md font-medium',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        className,
      )}
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      <span
        className={clsx('shrink-0 rounded-full', compact ? 'h-1.5 w-1.5' : 'h-2 w-2')}
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
