'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { NotificationDto } from '@housekeeping/shared';
import { IconBell } from '@/components/icons';
import { useNotifications } from '@/lib/hooks/useNotifications';

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

export function NotificationBell({ variant = 'default' }: { variant?: 'default' | 'onDark' }) {
  const router = useRouter();
  const t = useTranslations('notifications');
  const resolveText = useNotificationText();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  async function onItemClick(n: NotificationDto) {
    if (!n.readAt) await markRead(n.id);
    setOpen(false);
    if (n.linkPath) router.push(n.linkPath);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition',
          variant === 'onDark'
            ? 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'
            : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        )}
        aria-label={`${t('title')}${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <IconBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-lift">
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
      )}
    </div>
  );
}
