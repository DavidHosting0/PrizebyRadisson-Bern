'use client';

import { TeamChatView } from '@/components/team-chat/TeamChatView';

export default function TechnicianChatPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-4 py-2.5">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Chat</h1>
        <p className="text-xs text-ink-muted">Team messages & live requests</p>
      </div>
      <TeamChatView className="min-h-0 flex-1" />
    </div>
  );
}
