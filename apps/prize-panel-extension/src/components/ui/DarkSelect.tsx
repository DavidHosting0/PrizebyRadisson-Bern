import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

export type DarkSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Max height of the open list (px). Default 168 ≈ ~7 rows. */
  maxListHeight?: number;
  className?: string;
};

export function DarkSelect({
  value,
  onChange,
  options,
  placeholder = 'Auswählen…',
  disabled,
  maxListHeight = 168,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setQuery('');
        }}
        className={clsx(
          'flex w-full min-h-[34px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[11px] transition',
          disabled
            ? 'cursor-not-allowed border-white/10 bg-white/[0.03] text-sidebar-muted'
            : open
              ? 'border-sky-400/45 bg-white/[0.08] text-white ring-1 ring-sky-400/25'
              : 'border-white/15 bg-white/[0.05] text-slate-100 hover:border-white/25 hover:bg-white/[0.08]',
        )}
      >
        <span className={clsx('min-w-0 flex-1 truncate', !selected && 'text-sidebar-muted')}>
          {selected ? (
            <>
              {selected.label}
              {selected.hint ? (
                <span className="text-sidebar-muted"> · {selected.hint}</span>
              ) : null}
            </>
          ) : (
            placeholder
          )}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={clsx('shrink-0 text-sidebar-muted transition', open && 'rotate-180')}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-white/12 bg-[#1e2a3c] shadow-[0_12px_32px_rgba(0,0,0,0.45)] ring-1 ring-black/20">
          <div className="border-b border-white/10 p-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-[11px] text-white placeholder:text-sidebar-muted focus:border-sky-400/40 focus:outline-none"
            />
          </div>
          <ul
            className="overflow-y-auto overscroll-contain py-1"
            style={{ maxHeight: maxListHeight }}
            role="listbox"
          >
            {filtered.length === 0 && (
              <li className="px-2.5 py-2 text-[10px] text-sidebar-muted">Keine Treffer</li>
            )}
            {filtered.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(o.value)}
                    className={clsx(
                      'flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-[11px] transition',
                      active
                        ? 'bg-action/25 text-white'
                        : 'text-slate-200 hover:bg-white/[0.08]',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                    {o.hint && (
                      <span className="shrink-0 text-[9px] text-sidebar-muted">{o.hint}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
