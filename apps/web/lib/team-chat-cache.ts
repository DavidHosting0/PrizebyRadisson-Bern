import type { QueryClient } from '@tanstack/react-query';
import {
  localizeTeamChatMessage,
  mergeTeamChatMessage,
  type TeamChatMergeMsg,
} from '@housekeeping/shared';
import { api } from '@/lib/api';

export const TEAM_CHAT_MESSAGES_QUERY_KEY = ['team-chat-messages'] as const;

const CHAT_STALE_MS = 60_000;
const CHAT_GC_MS = 30 * 60_000;

export function teamChatMessagesQueryKey(locale: string) {
  return [...TEAM_CHAT_MESSAGES_QUERY_KEY, locale] as const;
}

export function upsertTeamChatMessage<T extends TeamChatMergeMsg>(
  qc: QueryClient,
  msg: T,
  locale?: string,
) {
  const localized = locale ? localizeTeamChatMessage(msg, locale) : msg;
  qc.setQueriesData<T[]>({ queryKey: TEAM_CHAT_MESSAGES_QUERY_KEY }, (old) =>
    mergeTeamChatMessage(old, localized),
  );
}

export function removeTeamChatMessage(qc: QueryClient, messageId: string) {
  qc.setQueriesData<{ id: string }[]>({ queryKey: TEAM_CHAT_MESSAGES_QUERY_KEY }, (old) =>
    (old ?? []).filter((m) => m.id !== messageId),
  );
}

/** Warm the chat list so opening /chat does not flash an empty/side-feed-only timeline. */
export function prefetchTeamChatMessages(qc: QueryClient, locale: string) {
  return qc.prefetchQuery({
    queryKey: teamChatMessagesQueryKey(locale),
    queryFn: () => api<TeamChatMergeMsg[]>(`/team-chat/messages?limit=300&lang=${locale}`),
    staleTime: CHAT_STALE_MS,
    gcTime: CHAT_GC_MS,
  });
}

export const teamChatQueryOptions = {
  staleTime: CHAT_STALE_MS,
  gcTime: CHAT_GC_MS,
} as const;
