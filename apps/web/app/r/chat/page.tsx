'use client';

import { TeamChatView } from '@/components/team-chat/TeamChatView';

export default function ReceptionTeamChatPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3 md:px-6">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Chat</h1>
      </div>
      <TeamChatView className="h-0 min-h-0 flex-1" embedOperationsSocket={false} />
    </div>
  );
}
