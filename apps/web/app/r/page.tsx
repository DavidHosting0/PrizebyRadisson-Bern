'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { KpiStat } from '@/components/supervisor/KpiStat';
import { ReceptionRoomBoard } from '@/components/reception/ReceptionRoomBoard';
import { PageHeader, PageSection, PageShell } from '@/components/ui/PageShell';

type RoomRow = { id: string; roomNumber: string; floor: number | null; derivedStatus: string };
type ReqRow = { id: string; status: string };

export default function ReceptionDashboardPage() {
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
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Live operational snapshot"
        actions={
          <>
            <Link
              href="/r/rooms"
              className="inline-flex min-h-[40px] items-center justify-center rounded-btn border border-border px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              Room board
            </Link>
            <Link
              href="/r/requests"
              className="inline-flex min-h-[40px] items-center justify-center rounded-btn border border-border px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              Service requests
            </Link>
          </>
        }
      />

      <PageSection title="Overview">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
          <KpiStat label="Total rooms" value={stats.total} />
          <KpiStat label="Clean / ready" value={stats.clean} sub="Turn-down complete" />
          <KpiStat label="In progress" value={stats.progress} />
          <KpiStat label="Dirty" value={stats.dirty} />
          <KpiStat label="Active requests" value={stats.activeReq} sub="Open pipeline" />
        </div>
      </PageSection>

      <PageSection
        title="Live room status"
        description="Click a room for details. Urgent request flags highlighted."
      >
        <ReceptionRoomBoard compact />
      </PageSection>
    </PageShell>
  );
}
