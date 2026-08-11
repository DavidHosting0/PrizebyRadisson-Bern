'use client';

import { TeamChatView } from '@/components/team-chat/TeamChatView';
import { useTranslations } from 'next-intl';
import { AppPageChrome } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionTeamChatPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppPageChrome title={tNav('teamChat')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <TeamChatView className="h-0 min-h-0 flex-1" embedOperationsSocket={false} />
    </div>
  );
}
