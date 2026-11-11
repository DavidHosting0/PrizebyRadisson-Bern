import type { QueryClient } from '@tanstack/react-query';
import {
  localizeTeamChatMessage,
  mergeTeamChatMessage,
  type TeamChatMergeMsg,
} from '@housekeeping/shared';
import { api } from '@/lib/api';

export const TEAM_CHAT_MESSAGES_QUERY_KEY = ['team-chat-messages'] as const;

/** Initial / page size for chat history (newer window first; older via `before=`). */
export const TEAM_CHAT_PAGE_SIZE = 60;

const CHAT_STALE_MS = 60_000;
const CHAT_GC_MS = 30 * 60_000;

export function teamChatMessagesQueryKey(locale: string) {
  return [...TEAM_CHAT_MESSAGES_QUERY_KEY, locale] as const;
}

export function teamChatMessagesUrl(locale: string, opts?: { before?: string; limit?: number }) {
  const limit = opts?.limit ?? TEAM_CHAT_PAGE_SIZE;
  const params = new URLSearchParams({
    limit: String(limit),
    lang: locale,
  });
  if (opts?.before) params.set('before', opts.before);
  return `/team-chat/messages?${params.toString()}`;
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
    queryFn: () => api<TeamChatMergeMsg[]>(teamChatMessagesUrl(locale)),
    staleTime: CHAT_STALE_MS,
    gcTime: CHAT_GC_MS,
  });
}

/** Prepend older messages (chronological) without dropping ones already cached. */
export function prependTeamChatMessages<T extends { id: string; createdAt: string }>(
  existing: T[] | undefined,
  older: T[],
): T[] {
  if (!older.length) return existing ?? [];
  const have = new Set((existing ?? []).map((m) => m.id));
  const fresh = older.filter((m) => !have.has(m.id));
  if (!fresh.length) return existing ?? [];
  return [...fresh, ...(existing ?? [])];
}

export const teamChatQueryOptions = {
  staleTime: CHAT_STALE_MS,
  gcTime: CHAT_GC_MS,
} as const;
