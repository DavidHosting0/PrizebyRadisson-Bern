import clsx from 'clsx';

type Task = { id: string; label: string; status: string };

export function ChecklistToggle({
  task,
  onCycle,
}: {
  task: Task;
  onCycle: () => void;
}) {
  const { status } = task;
  return (
    <button
      type="button"
      onClick={onCycle}
      className="flex w-full min-h-[52px] items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3 text-left shadow-card tap-scale"
    >
      <span className="font-medium text-ink">{task.label}</span>
      <span
        className={clsx(
          'relative h-8 w-[3.25rem] shrink-0 rounded-full p-1 transition-colors duration-200',
          status === 'COMPLETED' && 'bg-success',
          status === 'IN_PROGRESS' && 'bg-warning-muted',
          status === 'NOT_STARTED' && 'bg-surface-muted',
        )}
        aria-label={`${task.label}: ${status.replace('_', ' ').toLowerCase()}`}
      >
        <span
          className={clsx(
            'absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all duration-200',
            status === 'NOT_STARTED' && 'left-1',
            status === 'IN_PROGRESS' && 'left-1/2 -translate-x-1/2',
            status === 'COMPLETED' && 'right-1 left-auto',
          )}
        />
      </span>
    </button>
  );
}
