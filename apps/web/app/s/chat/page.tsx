'use client';

import { TeamChatView } from '@/components/team-chat/TeamChatView';
import { AppPageChrome } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

export default function SupervisorTeamChatPage() {
  const { enterMobile } = useSupervisorMobileMode();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppPageChrome title="Team chat" actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <TeamChatView className="h-0 min-h-0 flex-1" />
    </div>
  );
}
