'use client';

import { TeamChatView } from '@/components/team-chat/TeamChatView';

export default function ReceptionTeamChatPage() {
  return (
    <div className="flex min-h-[min(100dvh,880px)] flex-col px-4 py-4 md:min-h-[calc(100dvh-3.5rem-1px)] md:px-6">
      <div className="mb-3 shrink-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Team chat</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Message housekeepers and supervisors. Requests below sync in real time with the operations feed.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <TeamChatView className="min-h-0 flex-1" embedOperationsSocket={false} />
      </div>
    </div>
  );
}
