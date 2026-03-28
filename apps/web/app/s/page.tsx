'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { KpiStat } from '@/components/supervisor/KpiStat';

type RoomRow = { id: string; derivedStatus: string };

type Req = { id: string; status: string };

export default function SupervisorDashboardPage() {
  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', 'supervisor', 'dash'],
    queryFn: () => api<RoomRow[]>('/rooms'),
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['service-requests', 'supervisor'],
    queryFn: () => api<Req[]>('/service-requests'),
  });

  const stats = useMemo(() => {
    const total = rooms.length;
    const clean = rooms.filter((r) => r.derivedStatus === 'CLEAN' || r.derivedStatus === 'INSPECTED').length;
    const dirty = rooms.filter((r) => r.derivedStatus === 'DIRTY').length;
    const progress = rooms.filter((r) => r.derivedStatus === 'IN_PROGRESS').length;
    const activeReq = requests.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CANCELLED').length;
    return { total, clean, dirty, progress, activeReq };
  }, [rooms, requests]);

  return (
    <div className="space-y-10 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Supervisor dashboard</h1>
          <p className="mt-1 text-sm text-ink-muted">Operational overview — Prize by Radisson Bern</p>
        </div>
        <Link
          href="/s/board"
          className="inline-flex min-h-[48px] items-center justify-center rounded-btn bg-action px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-action/90"
        >
          Open assignment board
        </Link>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Overview</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiStat label="Total rooms" value={stats.total} />
          <KpiStat label="Clean" value={stats.clean} />
          <KpiStat label="In progress" value={stats.progress} />
          <KpiStat label="Dirty" value={stats.dirty} />
          <KpiStat label="Active requests" value={stats.activeReq} sub="Open pipeline" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-6 shadow-card">
          <h3 className="font-semibold text-ink">Assignments</h3>
          <p className="mt-2 text-sm text-ink-muted">
            Drag rooms onto housekeepers, run auto-assign, or override suggestions in the board view.
          </p>
          <Link href="/s/board" className="mt-4 inline-block text-sm font-medium text-action hover:underline">
            Go to assignment board →
          </Link>
        </div>
        <div className="rounded-card border border-border bg-surface p-6 shadow-card">
          <h3 className="font-semibold text-ink">Service requests</h3>
          <p className="mt-2 text-sm text-ink-muted">Monitor status, escalate urgent items, or update resolution.</p>
          <Link href="/s/requests" className="mt-4 inline-block text-sm font-medium text-action hover:underline">
            View requests →
          </Link>
        </div>
      </section>
    </div>
  );
}
