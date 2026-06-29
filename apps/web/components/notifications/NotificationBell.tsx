'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import type { NotificationDto } from '@housekeeping/shared';
import { IconBell } from '@/components/icons';
import { useNotifications } from '@/lib/hooks/useNotifications';

const MENU_WIDTH = 352;
const MENU_MIN_HEIGHT = 160;
const GAP = 4;
const VIEWPORT_PAD = 8;

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function useNotificationText() {
  const t = useTranslations('notifications');

  return (n: NotificationDto) => {
    const meta = n.metadata as {
      messageKey?: string;
      messageParams?: Record<string, string>;
      bodyKey?: string;
      bodyParams?: Record<string, string>;
    } | null;

    if (meta?.messageKey) {
      const title = t(meta.messageKey as 'teamChatMention', meta.messageParams ?? {});
      const body = meta.bodyKey
        ? t(meta.bodyKey as 'teamChatMentionBody', meta.bodyParams ?? meta.messageParams ?? {})
        : n.body;
      return { title, body };
    }
    return { title: n.title, body: n.body };
  };
}

function useMenuPosition(open: boolean, buttonRef: React.RefObject<HTMLButtonElement | null>) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  const update = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const width = Math.min(window.innerWidth - VIEWPORT_PAD * 2, MENU_WIDTH);
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
    const spaceAbove = rect.top - VIEWPORT_PAD;
    const openUp = spaceBelow < MENU_MIN_HEIGHT && spaceAbove > spaceBelow;

    let left = rect.right - width;
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - width - VIEWPORT_PAD));

    if (openUp) {
      setStyle({
        position: 'fixed',
        left,
        bottom: window.innerHeight - rect.top + GAP,
        width,
        zIndex: 50,
        visibility: 'visible',
      });
    } else {
      setStyle({
        position: 'fixed',
        left,
        top: rect.bottom + GAP,
        width,
        zIndex: 50,
        visibility: 'visible',
      });
    }
  }, [buttonRef]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  return style;
}

export function NotificationBell({ variant = 'default' }: { variant?: 'default' | 'onDark' }) {
  const router = useRouter();
  const t = useTranslations('notifications');
  const resolveText = useNotificationText();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuStyle = useMenuPosition(open, buttonRef);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  async function onItemClick(n: NotificationDto) {
    if (!n.readAt) await markRead(n.id);
    setOpen(false);
    if (n.linkPath) router.push(n.linkPath);
  }

  const menu = open ? (
    <div
      ref={menuRef}
      style={menuStyle}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-lift"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-ink">{t('title')}</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-xs font-medium text-action hover:underline"
          >
            {t('markAllRead')}
          </button>
        )}
      </div>
      <ul className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-ink-muted">{t('empty')}</li>
        ) : (
          notifications.map((n) => {
            const { title, body } = resolveText(n);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void onItemClick(n)}
                  className={clsx(
                    'w-full border-b border-border/60 px-3 py-2.5 text-left transition hover:bg-surface-muted',
                    !n.readAt && 'bg-action-muted/20',
                  )}
                >
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{body}</p>
                  <p className="mt-1 text-[10px] text-ink-muted">{formatRelativeTime(n.createdAt)}</p>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-panel',
          variant === 'onDark'
            ? 'bg-white/5 text-sidebar-muted hover:bg-white/10 hover:text-white'
            : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        )}
        aria-label={`${t('title')}${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
      >
        <IconBell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {typeof document !== 'undefined' && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
