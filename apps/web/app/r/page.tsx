'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { KpiStat } from '@/components/supervisor/KpiStat';
import { ReceptionRoomBoard } from '@/components/reception/ReceptionRoomBoard';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

type RoomRow = { id: string; roomNumber: string; floor: number | null; derivedStatus: string };
type ReqRow = { id: string; status: string };

export default function ReceptionDashboardPage() {
  const { enterMobile } = useReceptionMobileMode();
  const { data: rooms = [] } = useQuery(roomsListQueryOptions<RoomRow>());

  const { data: requests = [] } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<ReqRow[]>('/service-requests'),
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
        title="Dashboard"
        description="Live operational snapshot"
        actions={
          <>
            <AppChromeTools onEnterMobile={enterMobile} />
            <Link
              href="/r/rooms"
              className="inline-flex min-h-[40px] items-center justify-center rounded-btn border border-sidebar-border px-4 text-sm font-medium text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              Room board
            </Link>
            <Link
              href="/r/requests"
              className="inline-flex min-h-[40px] items-center justify-center rounded-btn bg-action px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-action/90"
            >
              Service requests
            </Link>
          </>
        }
      />

      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
          <section>
            <h2 className="text-base font-semibold text-white">Overview</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-5">
              <KpiStat tone="dark" label="Total rooms" value={stats.total} />
              <KpiStat tone="dark" label="Clean / ready" value={stats.clean} sub="Turn-down complete" />
              <KpiStat tone="dark" label="In progress" value={stats.progress} />
              <KpiStat tone="dark" label="Dirty" value={stats.dirty} />
              <KpiStat tone="dark" label="Active requests" value={stats.activeReq} sub="Open pipeline" />
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Live room status</h2>
            <p className="mt-1 text-sm text-sidebar-muted">
              Click a room for details. Urgent request flags highlighted.
            </p>
            <div className={APP_DARK_CARD + ' mt-4 p-4 md:p-6'}>
              <ReceptionRoomBoard compact />
            </div>
          </section>
        </div>
      </AppPageBody>
    </div>
  );
}
