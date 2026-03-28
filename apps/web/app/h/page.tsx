'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

type RoomRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
  checklist: {
    tasks: { status: string }[];
  } | null;
};

export default function HousekeeperRoomsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['rooms', 'mine'],
    queryFn: () => api<RoomRow[]>('/rooms?mine=1'),
  });

  if (isLoading) return <p className="p-4 text-slate-600">Loading rooms…</p>;
  if (error) return <p className="p-4 text-red-600">Could not load rooms.</p>;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink">My rooms</h1>
      <ul className="mt-4 space-y-3">
        {data?.map((r) => {
          const total = r.checklist?.tasks.length ?? 0;
          const done = r.checklist?.tasks.filter((t) => t.status === 'COMPLETED').length ?? 0;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <li key={r.id}>
              <Link
                href={`/h/room/${r.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium">Room {r.roomNumber}</span>
                  <StatusBadge status={r.derivedStatus} />
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {done}/{total} tasks
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
