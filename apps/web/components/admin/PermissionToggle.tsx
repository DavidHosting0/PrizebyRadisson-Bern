'use client';

import clsx from 'clsx';

/**
 * Discord-inspired permission row: title, description, on/off switch on the right.
 * The whole row is clickable.
 */
export function PermissionToggle({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={clsx(
        'group flex w-full items-center justify-between gap-4 rounded-lg border border-transparent px-3 py-3 text-left transition-colors',
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-muted',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      <span
        aria-hidden
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-success' : 'bg-ink/15',
        )}
      >
        <span
          className={clsx(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}
