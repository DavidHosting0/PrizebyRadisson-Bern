import type { QueryClient } from '@tanstack/react-query';
import { mergeTeamChatMessage, type TeamChatMergeMsg } from '@housekeeping/shared';

const CHAT_QUERY = { queryKey: ['team-chat-messages'] } as const;

export function upsertTeamChatMessage<T extends TeamChatMergeMsg>(qc: QueryClient, msg: T) {
  qc.setQueriesData<T[]>(CHAT_QUERY, (old) => mergeTeamChatMessage(old, msg));
}

export function removeTeamChatMessage(qc: QueryClient, messageId: string) {
  qc.setQueriesData<{ id: string }[]>(CHAT_QUERY, (old) =>
    (old ?? []).filter((m) => m.id !== messageId),
  );
}
