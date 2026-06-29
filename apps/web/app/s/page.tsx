'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { KpiStat } from '@/components/supervisor/KpiStat';
import { Card } from '@/components/ui/Card';
import { PageHeader, PageSection, PageShell } from '@/components/ui/PageShell';

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
    <PageShell>
      <PageHeader
        title="Supervisor dashboard"
        description="Operational overview — Prize by Radisson Bern"
        actions={
          <Link
            href="/s/board"
            className="inline-flex min-h-[40px] items-center justify-center rounded-btn bg-action px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-action/90"
          >
            Open assignment board
          </Link>
        }
      />

      <PageSection title="Overview">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiStat label="Total rooms" value={stats.total} />
          <KpiStat label="Clean" value={stats.clean} />
          <KpiStat label="In progress" value={stats.progress} />
          <KpiStat label="Dirty" value={stats.dirty} />
          <KpiStat label="Active requests" value={stats.activeReq} sub="Open pipeline" />
        </div>
      </PageSection>

      <PageSection title="Quick actions">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <h3 className="font-semibold text-ink">Daily departures</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              See who is leaving today and auto-assign departure rooms evenly across your team by floor.
            </p>
            <Link
              href="/s/departures"
              className="mt-4 inline-flex text-sm font-medium text-action transition-colors hover:text-action/80"
            >
              View departures →
            </Link>
          </Card>
          <Card>
            <h3 className="font-semibold text-ink">Assignments</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Drag rooms onto housekeepers, run auto-assign, or override suggestions in the board view.
            </p>
            <Link
              href="/s/board"
              className="mt-4 inline-flex text-sm font-medium text-action transition-colors hover:text-action/80"
            >
              Go to assignment board →
            </Link>
          </Card>
          <Card>
            <h3 className="font-semibold text-ink">Service requests</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Monitor status, escalate urgent items, or update resolution.
            </p>
            <Link
              href="/s/requests"
              className="mt-4 inline-flex text-sm font-medium text-action transition-colors hover:text-action/80"
            >
              View requests →
            </Link>
          </Card>
        </div>
      </PageSection>
    </PageShell>
  );
}
