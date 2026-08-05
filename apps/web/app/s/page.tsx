'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { KpiStat } from '@/components/supervisor/KpiStat';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

type RoomRow = { id: string; derivedStatus: string };

type Req = { id: string; status: string };

export default function SupervisorDashboardPage() {
  const { enterMobile } = useSupervisorMobileMode();
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
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Supervisor dashboard"
        description="Operational overview — Prize by Radisson Bern"
        actions={
          <>
            <AppChromeTools onEnterMobile={enterMobile} />
            <Link
              href="/s/board"
              className="inline-flex min-h-[40px] items-center justify-center rounded-btn bg-action px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-action/90"
            >
              Open assignment board
            </Link>
          </>
        }
      />

      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
          <section>
            <h2 className="text-base font-semibold text-white">Overview</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
              <KpiStat tone="dark" label="Total rooms" value={stats.total} />
              <KpiStat tone="dark" label="Clean" value={stats.clean} />
              <KpiStat tone="dark" label="In progress" value={stats.progress} />
              <KpiStat tone="dark" label="Dirty" value={stats.dirty} />
              <KpiStat tone="dark" label="Active requests" value={stats.activeReq} sub="Open pipeline" />
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Quick actions</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className={APP_DARK_CARD + ' p-5'}>
                <h3 className="font-semibold text-white">Daily departures</h3>
                <p className="mt-2 text-sm leading-relaxed text-sidebar-muted">
                  See who is leaving today and auto-assign departure rooms evenly across your team by floor.
                </p>
                <Link
                  href="/s/departures"
                  className="mt-4 inline-flex text-sm font-medium text-action transition-colors hover:text-action/80"
                >
                  View departures →
                </Link>
              </div>
              <div className={APP_DARK_CARD + ' p-5'}>
                <h3 className="font-semibold text-white">Assignments</h3>
                <p className="mt-2 text-sm leading-relaxed text-sidebar-muted">
                  Drag rooms onto housekeepers, run auto-assign, or override suggestions in the board view.
                </p>
                <Link
                  href="/s/board"
                  className="mt-4 inline-flex text-sm font-medium text-action transition-colors hover:text-action/80"
                >
                  Go to assignment board →
                </Link>
              </div>
              <div className={APP_DARK_CARD + ' p-5'}>
                <h3 className="font-semibold text-white">Service requests</h3>
                <p className="mt-2 text-sm leading-relaxed text-sidebar-muted">
                  Monitor status, escalate urgent items, or update resolution.
                </p>
                <Link
                  href="/s/requests"
                  className="mt-4 inline-flex text-sm font-medium text-action transition-colors hover:text-action/80"
                >
                  View requests →
                </Link>
              </div>
            </div>
          </section>
        </div>
      </AppPageBody>
    </div>
  );
}
