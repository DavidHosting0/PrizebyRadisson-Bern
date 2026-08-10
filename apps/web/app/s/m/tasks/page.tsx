'use client';

import { OpenCleaningTasksView } from '@/components/supervisor/OpenCleaningTasksView';

export default function SupervisorMobileTasksPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Open tasks</h1>
        <p className="mt-1 text-sm text-sidebar-muted">
          Dirty rooms and restants still open for today’s crew.
        </p>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <OpenCleaningTasksView roomHref={(id) => `/s/m/room/${id}`} layout="stack" />
      </div>
    </div>
  );
}
