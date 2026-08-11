'use client';

import { useTranslations } from 'next-intl';
import { roomStatusLabel } from '@/components/StatusBadge';

/** Human-readable room board status for UI and toasts. */
export function useRoomStatusLabel() {
  const t = useTranslations();
  return (status: string) =>
    roomStatusLabel(status, (key) => t(key as 'room.status.DIRTY'));
}

export function formatRoomStatusLabel(
  status: string,
  t?: (key: string) => string,
): string {
  if (t) {
    return roomStatusLabel(status, t);
  }
  return status.replace(/_/g, ' ');
}
