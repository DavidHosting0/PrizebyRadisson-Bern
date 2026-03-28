'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';

export default function SupervisorPage() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['analytics'],
    enabled: !!user && (user.role === 'SUPERVISOR' || user.role === 'ADMIN'),
    queryFn: () =>
      api<{
        avgCleanTimeSeconds: number;
        avgRequestResolveTimeSeconds: number;
        tasksPerHousekeeper: { name: string; completedTasks: number }[];
      }>('/analytics/summary'),
  });

  const hk = data?.tasksPerHousekeeper ?? [];

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Supervisor</h1>
        <p className="mt-1 text-sm text-ink-muted">Performance overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Avg. clean time</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{data?.avgCleanTimeSeconds ?? 0}s</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Avg. request resolve</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">
            {data?.avgRequestResolveTimeSeconds ?? 0}s
          </p>
        </Card>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Tasks per housekeeper</h2>
        <ul className="mt-4 space-y-3">
          {hk.map((t) => (
            <li key={t.name}>
              <Card className="flex items-center justify-between gap-4">
                <span className="font-medium text-ink">{t.name}</span>
                <span className="text-2xl font-semibold tabular-nums text-ink">{t.completedTasks}</span>
              </Card>
            </li>
          ))}
        </ul>
        {hk.length === 0 && <p className="mt-2 text-sm text-ink-muted">No data yet.</p>}
      </section>
    </div>
  );
}
