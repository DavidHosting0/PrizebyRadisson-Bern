'use client';

import { TeamChatView } from '@/components/team-chat/TeamChatView';

export default function HousekeeperChatPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <TeamChatView className="h-0 min-h-0 flex-1" />
    </div>
  );
}
