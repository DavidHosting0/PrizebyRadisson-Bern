import type { QueryClient } from '@tanstack/react-query';
import {
  localizeTeamChatMessage,
  mergeTeamChatMessage,
  type TeamChatMergeMsg,
} from '@housekeeping/shared';

const CHAT_QUERY = { queryKey: ['team-chat-messages'] } as const;

export function upsertTeamChatMessage<T extends TeamChatMergeMsg>(
  qc: QueryClient,
  msg: T,
  locale?: string,
) {
  const localized = locale ? localizeTeamChatMessage(msg, locale) : msg;
  qc.setQueriesData<T[]>(CHAT_QUERY, (old) => mergeTeamChatMessage(old, localized));
}

export function removeTeamChatMessage(qc: QueryClient, messageId: string) {
  qc.setQueriesData<{ id: string }[]>(CHAT_QUERY, (old) =>
    (old ?? []).filter((m) => m.id !== messageId),
  );
}
