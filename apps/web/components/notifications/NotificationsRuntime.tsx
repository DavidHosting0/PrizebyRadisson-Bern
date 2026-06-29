'use client';

import { useNotifications } from '@/lib/hooks/useNotifications';

/** Mount once per layout to wire Socket.IO notification delivery. */
export function NotificationsRuntime() {
  useNotifications();
  return null;
}
