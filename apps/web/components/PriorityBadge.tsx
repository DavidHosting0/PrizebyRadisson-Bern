import clsx from 'clsx';

export function PriorityBadge({ priority }: { priority: string }) {
  const urgent = priority === 'URGENT';
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
        urgent ? 'bg-danger-muted text-danger' : 'bg-surface-muted text-ink-muted',
      )}
    >
      {urgent ? 'Urgent' : 'Normal'}
    </span>
  );
}
