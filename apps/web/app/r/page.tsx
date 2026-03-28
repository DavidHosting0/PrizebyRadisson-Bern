'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { api, API_BASE } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

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

  if (isLoading) return <p className="p-4">Loading floor…</p>;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Live floor</h1>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {data?.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm"
          >
            <p className="font-semibold">{r.roomNumber}</p>
            <div className="mt-2 flex justify-center">
              <StatusBadge status={r.derivedStatus} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
