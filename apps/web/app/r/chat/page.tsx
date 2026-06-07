'use client';

import { TeamChatView } from '@/components/team-chat/TeamChatView';

export default function ReceptionTeamChatPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3 md:px-6">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Team chat</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Message housekeepers and supervisors. Requests below sync in real time with the operations feed.
        </p>
      </div>
      <TeamChatView className="min-h-0 flex-1" embedOperationsSocket={false} />
    </div>
  );
}
