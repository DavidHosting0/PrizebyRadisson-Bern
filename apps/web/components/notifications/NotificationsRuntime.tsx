'use client';

import { useNotifications } from '@/lib/hooks/useNotifications';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';

/** Mount once per layout: Socket.IO inbox + keep Web Push subscription alive. */
export function NotificationsRuntime() {
  useNotifications();
  // Re-registers the device with the API when permission is already granted.
  usePushNotifications();
  return null;
}
