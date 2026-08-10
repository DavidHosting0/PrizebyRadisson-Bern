'use client';

import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { OpenCleaningTasksView } from '@/components/supervisor/OpenCleaningTasksView';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

export default function SupervisorOpenTasksPage() {
  const { enterMobile } = useSupervisorMobileMode();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppPageChrome
        title="Open tasks"
        description="Open departures and restants per cleaner for today."
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />
      <AppPageBody className="flex min-h-0 flex-1 flex-col p-4 md:p-5">
        <OpenCleaningTasksView
          roomHref={(id) => `/s/room-management/${id}`}
          layout="grid"
        />
      </AppPageBody>
    </div>
  );
}
