'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

export default function SupervisorPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'SUPERVISOR' && user.role !== 'ADMIN') router.replace('/');
  }, [user, loading, router]);

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

  if (loading || !user) return <p className="p-4">Loading…</p>;

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">Supervisor</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Avg clean time</p>
          <p className="text-2xl font-semibold">{data?.avgCleanTimeSeconds ?? 0}s</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Avg request resolve</p>
          <p className="text-2xl font-semibold">{data?.avgRequestResolveTimeSeconds ?? 0}s</p>
        </div>
      </div>
      <section>
        <h2 className="font-medium">Tasks per housekeeper</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data?.tasksPerHousekeeper.map((t) => (
            <li key={t.name}>
              {t.name}: {t.completedTasks}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
