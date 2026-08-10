'use client';

import { useEffect, useRef } from 'react';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';

export type AssignMenuPerson = {
  id: string;
  name: string;
  titlePrefix: string;
};

export function AssignRoomContextMenu({
  x,
  y,
  roomNumber,
  people,
  onAssign,
  onDeferTomorrow,
  onClose,
}: {
  x: number;
  y: number;
  roomNumber: string;
  people: AssignMenuPerson[];
  onAssign: (housekeeperUserId: string) => void;
  onDeferTomorrow?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, people.length]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Assign room ${roomNumber}`}
      className="fixed z-[120] w-[220px] overflow-hidden rounded-card border border-sidebar-border bg-sidebar shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
      style={{ left: x, top: y }}
    >
      <div className="border-b border-white/10 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Assign room {roomNumber}
        </p>
      </div>
      <ul className="max-h-[280px] overflow-y-auto py-1">
        {people.length === 0 && (
          <li className="px-3 py-2 text-xs text-sidebar-muted">No cleaners for today</li>
        )}
        {people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-2 text-left text-sm text-slate-100 hover:bg-action/25"
              onClick={() => {
                onAssign(p.id);
                onClose();
              }}
            >
              {formatUserWithTitlePrefix(p.name, p.titlePrefix)}
            </button>
          </li>
        ))}
      </ul>
      {onDeferTomorrow && (
        <div className="border-t border-white/10 py-1">
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-sm text-amber-200 hover:bg-amber-500/15"
            onClick={() => {
              onDeferTomorrow();
              onClose();
            }}
          >
            Leave for tomorrow
          </button>
        </div>
      )}
    </div>
  );
}
