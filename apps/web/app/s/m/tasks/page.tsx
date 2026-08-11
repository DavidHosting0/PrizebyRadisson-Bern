'use client';

import { useTranslations } from 'next-intl';
import { OpenCleaningTasksView } from '@/components/supervisor/OpenCleaningTasksView';

export default function SupervisorMobileTasksPage() {
  const tNav = useTranslations('nav');
  const tSup = useTranslations('supervisor');

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{tNav('openTasks')}</h1>
        <p className="mt-1 text-sm text-sidebar-muted">{tSup('openTasksSubtitle')}</p>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <OpenCleaningTasksView roomHref={(id) => `/s/m/room/${id}`} layout="stack" />
      </div>
    </div>
  );
}
