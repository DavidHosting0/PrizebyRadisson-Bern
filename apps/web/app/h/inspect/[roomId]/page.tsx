'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { InspectionQueueResponse } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InspectRoomModal } from '@/components/supervisor/InspectRoomModal';

type RoomDetail = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
};

export default function HousekeeperInspectRoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const roomId = params.roomId as string;
  const [inspectOpen, setInspectOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api<RoomDetail>(`/rooms/${roomId}`),
  });

  const queueQ = useQuery({
    queryKey: ['assignments', 'my-inspection-tasks'],
    queryFn: () => api<InspectionQueueResponse>('/assignments/my-inspection-tasks'),
  });

  const task = queueQ.data?.tasks.find((t) => t.roomId === roomId);
  const claimedByMe = task?.claimedByUserId === user?.id && task?.status === 'CLAIMED';

  if (isLoading || !data) {
    return (
      <div className="p-4">
        <p className="text-sm text-ink-muted">{error ? 'Could not load room.' : 'Loading…'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link
          href="/h"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-card tap-scale"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Inspect {data.roomNumber}</h1>
          {data.floor != null && <p className="text-xs text-ink-muted">Floor {data.floor}</p>}
        </div>
      </div>

      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Status</p>
        <div className="mt-2">
          <StatusBadge status={data.derivedStatus} />
        </div>
        {!claimedByMe && (
          <p className="mt-3 text-sm text-ink-muted">
            Claim this room from the Inspections list on Home before inspecting.
          </p>
        )}
      </Card>

      <Button
        type="button"
        variant="action"
        className="min-h-[52px] w-full"
        disabled={!claimedByMe}
        onClick={() => setInspectOpen(true)}
      >
        Open inspection
      </Button>
      <Button type="button" variant="ghost" className="min-h-[48px] w-full" onClick={() => router.push('/h')}>
        Back to home
      </Button>

      <InspectRoomModal
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        roomId={data.id}
        roomNumber={data.roomNumber}
      />
    </div>
  );
}
