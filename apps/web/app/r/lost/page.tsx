'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';

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

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Lost & found</h1>
        <p className="mt-1 text-sm text-ink-muted">Items logged by the team.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((item) => (
          <li key={item.id}>
            <Card className="h-full">
              <p className="font-medium leading-snug text-ink">{item.description}</p>
              <p className="mt-3 text-sm text-ink-muted">
                {item.room ? `Room ${item.room.roomNumber}` : 'No room'} ·{' '}
                {new Date(item.foundAt).toLocaleDateString()}
              </p>
              <span className="mt-3 inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium capitalize text-ink-muted">
                {item.status.replace(/_/g, ' ').toLowerCase()}
              </span>
            </Card>
          </li>
        ))}
      </ul>
      {data?.length === 0 && <p className="text-sm text-ink-muted">No items yet.</p>}
    </div>
  );
}
