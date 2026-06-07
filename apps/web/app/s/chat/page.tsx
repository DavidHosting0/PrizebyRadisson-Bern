'use client';

import { TeamChatView } from '@/components/team-chat/TeamChatView';

export default function SupervisorTeamChatPage() {
  return (
    <div className="flex h-[min(100dvh,900px)] min-w-0 flex-col overflow-hidden md:h-[calc(100dvh-1px)]">
      <div className="shrink-0 border-b border-border bg-surface px-4 py-4 shadow-card md:px-6">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Team chat</h1>
        <p className="mt-1 text-sm text-ink-muted">Shared with housekeepers and reception. New requests update live below.</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card md:mx-6 md:mb-6">
        <TeamChatView className="min-h-0 min-w-0 flex-1" />
      </div>
    </div>
  );
}
