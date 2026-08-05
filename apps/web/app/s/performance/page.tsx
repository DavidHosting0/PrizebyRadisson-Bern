'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

export default function SupervisorPerformancePage() {
  const { enterMobile } = useSupervisorMobileMode();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () =>
      api<{
        avgCleanTimeSeconds: number;
        avgRequestResolveTimeSeconds: number;
        tasksPerHousekeeper: { userId: string; name: string; titlePrefix: string | null; completedTasks: number }[];
      }>('/analytics/summary'),
  });

  const hk = data?.tasksPerHousekeeper ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Performance"
        description="Averages and throughput"
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />

      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
          {isLoading && <p className="text-sm text-sidebar-muted">Loading analytics…</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={APP_DARK_CARD + ' p-5'}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">Avg. clean time</p>
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-white">
                {data?.avgCleanTimeSeconds ?? 0}s
              </p>
            </div>
            <div className={APP_DARK_CARD + ' p-5'}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">Avg. request resolve</p>
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-white">
                {data?.avgRequestResolveTimeSeconds ?? 0}s
              </p>
            </div>
          </div>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">Tasks completed per housekeeper</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {hk.map((t) => (
                <div key={t.userId} className={APP_DARK_CARD + ' p-5'}>
                  <p className="text-sm font-medium text-white">
                    {formatUserWithTitlePrefix(t.name, t.titlePrefix)}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{t.completedTasks}</p>
                </div>
              ))}
            </div>
            {hk.length === 0 && !isLoading && <p className="text-sm text-sidebar-muted">No data yet.</p>}
          </section>
        </div>
      </AppPageBody>
    </div>
  );
}
