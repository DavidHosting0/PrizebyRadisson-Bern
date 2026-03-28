import clsx from 'clsx';

const LABEL: Record<string, string> = {
  OUT_OF_ORDER: 'OOO',
  DIRTY: 'Dirty',
  IN_PROGRESS: 'In progress',
  CLEAN: 'Clean',
  INSPECTED: 'Inspected',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'OUT_OF_ORDER' && 'bg-amber-100 text-amber-900',
        status === 'DIRTY' && 'bg-slate-200 text-slate-800',
        status === 'IN_PROGRESS' && 'bg-sky-100 text-sky-900',
        status === 'CLEAN' && 'bg-emerald-100 text-emerald-900',
        status === 'INSPECTED' && 'bg-teal-100 text-teal-900',
      )}
    >
      {LABEL[status] ?? status}
    </span>
  );
}
