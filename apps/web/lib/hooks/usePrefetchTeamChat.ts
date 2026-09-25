'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { usePermission } from '@/lib/auth-context';
import { useLocale } from '@/lib/locale-context';
import { prefetchTeamChatMessages } from '@/lib/team-chat-cache';

/** Warm team-chat cache while the user is in an app shell so /chat opens with messages already present. */
export function usePrefetchTeamChat() {
  const qc = useQueryClient();
  const { locale } = useLocale();
  const canRead = usePermission('TEAM_CHAT_READ');

  useEffect(() => {
    if (!canRead) return;
    void prefetchTeamChatMessages(qc, locale);
  }, [qc, locale, canRead]);
}
