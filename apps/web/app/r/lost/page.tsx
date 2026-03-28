'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Lf = {
  id: string;
  description: string;
  status: string;
  foundAt: string;
  room: { roomNumber: string } | null;
};

export default function ReceptionLostFoundPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['lost-found'],
    queryFn: () => api<Lf[]>('/lost-found'),
  });

  if (isLoading) return <p className="p-4">Loading…</p>;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Lost & found</h1>
      <ul className="mt-4 space-y-2">
        {data?.map((item) => (
          <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="font-medium">{item.description}</p>
            <p className="text-slate-500">
              {item.room ? `Room ${item.room.roomNumber}` : 'No room'} · {item.status}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
