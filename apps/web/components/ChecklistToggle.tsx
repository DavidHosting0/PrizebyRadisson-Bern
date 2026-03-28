import clsx from 'clsx';

type Task = { id: string; label: string; status: string };

export function ChecklistToggle({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: () => void;
}) {
  const done = task.status === 'COMPLETED';

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full min-h-[52px] items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3 text-left shadow-card tap-scale"
    >
      <span className="font-medium text-ink">{task.label}</span>
      <span
        className={clsx(
          'relative h-8 w-[3.25rem] shrink-0 rounded-full p-1 transition-colors duration-200',
          done ? 'bg-success' : 'bg-surface-muted',
        )}
        aria-pressed={done}
        aria-label={done ? `${task.label}: done` : `${task.label}: not done`}
      >
        <span
          className={clsx(
            'absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all duration-200',
            done ? 'right-1 left-auto' : 'left-1',
          )}
        />
      </span>
    </button>
  );
}
