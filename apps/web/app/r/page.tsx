'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { api, API_BASE } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';

type RoomRow = {
  id: string;
  roomNumber: string;
  derivedStatus: string;
};

export default function ReceptionFloorPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['rooms', 'all'],
    queryFn: () => api<RoomRow[]>('/rooms'),
  });

  useEffect(() => {
    const origin = API_BASE.replace(/\/api\/v1\/?$/, '');
    const socket = io(`${origin}/operations`, { transports: ['websocket'] });
    socket.on('room.status_updated', () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
    });
    return () => {
      socket.disconnect();
    };
  }, [qc]);

  const stats = useMemo(() => {
    const rooms = data ?? [];
    const total = rooms.length;
    const clean = rooms.filter((r) => r.derivedStatus === 'CLEAN' || r.derivedStatus === 'INSPECTED').length;
    const dirty = rooms.filter((r) => r.derivedStatus === 'DIRTY').length;
    const progress = rooms.filter((r) => r.derivedStatus === 'IN_PROGRESS').length;
    return { total, clean, dirty, progress };
  }, [data]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-ink-muted">Loading floor…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Live floor</h1>
        <p className="mt-1 text-sm text-ink-muted">Room status updates in real time.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total rooms', value: stats.total },
          { label: 'Clean', value: stats.clean },
          { label: 'In progress', value: stats.progress },
          { label: 'Dirty', value: stats.dirty },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{s.value}</p>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Room grid</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {data?.map((r) => (
            <Card key={r.id} className="text-center" padding>
              <p className="text-lg font-semibold text-ink">{r.roomNumber}</p>
              <div className="mt-3 flex justify-center">
                <StatusBadge status={r.derivedStatus} />
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
