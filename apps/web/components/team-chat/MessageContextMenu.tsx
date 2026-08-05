'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Quick reactions shown in the WhatsApp-style bar. */
export const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

/** Extra grid for the “pick more” button. */
export const MORE_REACTION_EMOJIS = [
  '👍',
  '👎',
  '❤️',
  '🔥',
  '😂',
  '😮',
  '😢',
  '🙏',
  '👏',
  '🎉',
  '✅',
  '👀',
  '⁉️',
  '💯',
  '🤝',
  '💪',
  '😅',
  '🤔',
  '😴',
  '🙌',
  '⭐',
  '🍀',
  '☕',
  '🍕',
] as const;

export type MessageMenuLabels = {
  reply: string;
  delete: string;
  react: string;
  moreEmojis: string;
  close: string;
};

type Props = {
  open: boolean;
  x: number;
  y: number;
  canReact: boolean;
  canDelete: boolean;
  labels: MessageMenuLabels;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDelete: () => void;
  onClose: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function MessageContextMenu({
  open,
  x,
  y,
  canReact,
  canDelete,
  labels,
  onReact,
  onReply,
  onDelete,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!open) setShowMore(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) {
      setPos({ left: x, top: y });
      return;
    }
    const pad = 12;
    const rect = el.getBoundingClientRect();
    const left = clamp(x - rect.width / 2, pad, window.innerWidth - rect.width - pad);
    const top = clamp(y - rect.height - 8, pad, window.innerHeight - rect.height - pad);
    setPos({ left, top });
  }, [open, x, y, showMore]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]" aria-hidden={!open}>
      <div
        ref={panelRef}
        role="menu"
        aria-label={labels.react}
        data-chat-message-menu
        className="pointer-events-auto absolute min-w-[220px] overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar shadow-lift"
        style={{ left: pos.left, top: pos.top }}
      >
        {canReact && (
          <div className="border-b border-sidebar-border px-2 py-2">
            {!showMore ? (
              <div className="flex items-center gap-0.5">
                {QUICK_REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    title={emoji}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[22px] transition hover:bg-white/10 active:scale-95"
                    onClick={() => onReact(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  title={labels.moreEmojis}
                  aria-label={labels.moreEmojis}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sidebar-muted transition hover:bg-white/10"
                  onClick={() => setShowMore(true)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
                    {labels.moreEmojis}
                  </span>
                  <button
                    type="button"
                    className="rounded-md px-2 py-0.5 text-[11px] font-medium text-action hover:bg-action/15"
                    onClick={() => setShowMore(false)}
                  >
                    {labels.close}
                  </button>
                </div>
                <div className="grid max-h-48 grid-cols-6 gap-0.5 overflow-y-auto">
                  {MORE_REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitem"
                      title={emoji}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[22px] transition hover:bg-white/10 active:scale-95"
                      onClick={() => onReact(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="py-1">
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white transition hover:bg-white/10"
            onClick={onReply}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-sidebar-muted">
              <path
                d="M10 9V5L3 12l7 7v-4.1c5 0 8.5 1.6 11 5.1-1-6-4.5-12-11-13z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            {labels.reply}
          </button>

          {canDelete && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-rose-400 transition hover:bg-rose-500/10"
              onClick={onDelete}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7M10 11v6M14 11v6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              {labels.delete}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Dim overlay while a long-press menu is open (mobile feel). */
export function MessageMenuScrim({ open }: { open: boolean }) {
  if (!open) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70] bg-ink/20" aria-hidden />,
    document.body,
  );
}

export function menuAnchorFromEvent(e: { clientX: number; clientY: number }) {
  return { x: e.clientX, y: e.clientY };
}

export function menuAnchorFromElement(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top };
}
