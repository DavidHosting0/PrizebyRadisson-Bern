'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import type { NotificationDto } from '@housekeeping/shared';
import { WS_EVENTS } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useToast } from '@/components/toast/ToastProvider';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;
export const NOTIFICATIONS_UNREAD_KEY = ['notifications-unread-count'] as const;

export function useNotifications() {
  const qc = useQueryClient();
  const toast = useToast();
  const pathname = usePathname();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: NOTIFICATIONS_UNREAD_KEY,
    queryFn: () => api<{ count: number }>('/notifications/unread-count').then((r) => r.count),
    refetchInterval: 60_000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => api<NotificationDto[]>('/notifications?limit=30'),
  });

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) return;

    const socket = getSocket(token);
    if (!socket) return;

    const onNotification = (payload: unknown) => {
      const n = payload as NotificationDto;
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });

      if (n?.linkPath && pathname === n.linkPath) return;
      if (n?.title) {
        toast.push(n.title, 'success');
      }
    };

    socket.on(WS_EVENTS.NOTIFICATION_CREATED, onNotification);
    return () => {
      socket.off(WS_EVENTS.NOTIFICATION_CREATED, onNotification);
    };
  }, [qc, toast, pathname]);

  const markRead = useCallback(
    async (id: string) => {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
    [qc],
  );

  const markAllRead = useCallback(async () => {
    await api('/notifications/read-all', { method: 'POST' });
    void qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
  }, [qc]);

  return { notifications, unreadCount, markRead, markAllRead };
}
