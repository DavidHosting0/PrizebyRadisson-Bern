'use client';

import clsx from 'clsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'] as const;

export function BreakfastNumpad({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  function press(key: (typeof KEYS)[number]) {
    if (key === 'C') {
      onChange('');
      return;
    }
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= 4) return;
    onChange(value + key);
  }

  return (
    <div className={clsx('grid grid-cols-3 gap-2', className)}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          className={clsx(
            'flex h-14 items-center justify-center rounded-2xl text-xl font-semibold transition duration-tap active:scale-[0.97]',
            key === 'C' || key === '⌫'
              ? 'bg-white/5 text-sidebar-muted ring-1 ring-inset ring-white/10'
              : 'bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15',
          )}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
