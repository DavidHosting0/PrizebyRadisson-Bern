'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { KpiStat } from '@/components/supervisor/KpiStat';
import { ReceptionRoomBoard } from '@/components/reception/ReceptionRoomBoard';

type RoomRow = { id: string; derivedStatus: string };
type ReqRow = { id: string; status: string };

export default function ReceptionDashboardPage() {
  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', 'reception'],
    queryFn: () => api<RoomRow[]>('/rooms'),
  });

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
    <div className="space-y-10 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">Live operational snapshot</p>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Overview</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
          <KpiStat label="Total rooms" value={stats.total} />
          <KpiStat label="Clean / ready" value={stats.clean} sub="Turn-down complete" />
          <KpiStat label="In progress" value={stats.progress} />
          <KpiStat label="Dirty" value={stats.dirty} />
          <KpiStat label="Active requests" value={stats.activeReq} sub="Open pipeline" />
        </div>
      </section>

      <section className="flex flex-wrap gap-4">
        <Link
          href="/r/rooms"
          className="text-sm font-medium text-action hover:underline"
        >
          Full room board →
        </Link>
        <Link href="/r/requests" className="text-sm font-medium text-action hover:underline">
          Service requests →
        </Link>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Live room status</h2>
            <p className="text-sm text-ink-muted">Click a room for details. Urgent request flags highlighted.</p>
          </div>
        </div>
        <ReceptionRoomBoard compact />
      </section>
    </div>
  );
}
