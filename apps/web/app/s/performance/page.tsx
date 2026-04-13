'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { KpiStat } from '@/components/supervisor/KpiStat';
import { Card } from '@/components/ui/Card';

export default function SupervisorPerformancePage() {
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
    <div className="space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Performance</h1>
        <p className="mt-1 text-sm text-ink-muted">Averages and throughput</p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading analytics…</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiStat label="Avg. clean time" value={`${data?.avgCleanTimeSeconds ?? 0}s`} />
        <KpiStat label="Avg. request resolve" value={`${data?.avgRequestResolveTimeSeconds ?? 0}s`} />
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Tasks completed per housekeeper</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {hk.map((t) => (
            <Card key={t.userId}>
              <p className="text-sm font-medium text-ink">
                {formatUserWithTitlePrefix(t.name, t.titlePrefix)}
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{t.completedTasks}</p>
            </Card>
          ))}
        </div>
        {hk.length === 0 && !isLoading && <p className="text-sm text-ink-muted">No data yet.</p>}
      </section>
    </div>
  );
}
