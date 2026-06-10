'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { PermissionToggle } from '@/components/admin/PermissionToggle';

type Group = { id: string; label: string; codes: string[] };

export function PermissionCategoryList({
  groups,
  labels,
  descriptions,
  selected,
  onToggle,
}: {
  groups: Group[];
  labels: Record<string, string>;
  descriptions: Record<string, string>;
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, true])),
  );

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = open[g.id] ?? true;
        const enabled = g.codes.filter((c) => selected.has(c)).length;
        return (
          <section
            key={g.id}
            className="overflow-hidden rounded-lg border border-border bg-surface-muted/30"
          >
            <button
              type="button"
              onClick={() => setOpen((prev) => ({ ...prev, [g.id]: !isOpen }))}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-muted/60"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={clsx(
                    'text-xs text-ink-muted transition-transform',
                    isOpen && 'rotate-90',
                  )}
                  aria-hidden
                >
                  ▶
                </span>
                <span className="text-sm font-semibold text-ink">{g.label}</span>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                {enabled}/{g.codes.length}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border/60 bg-surface px-1 pb-1">
                {g.codes.map((code) => (
                  <PermissionToggle
                    key={code}
                    title={labels[code] ?? code}
                    description={descriptions[code]}
                    checked={selected.has(code)}
                    onChange={() => onToggle(code)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
