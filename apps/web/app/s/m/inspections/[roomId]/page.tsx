'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LostFoundReportModal } from '@/components/housekeeper/LostFoundReportModal';
import { DamageReportModal } from '@/components/housekeeper/DamageReportModal';
import { InspectRoomModal } from '@/components/supervisor/InspectRoomModal';
import { usePermission } from '@/lib/auth-context';

type RoomDetail = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
};

export default function SupervisorMobileInspectionRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const [inspectOpen, setInspectOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const canReportDamage = usePermission('DAMAGE_REPORT_CREATE');

  const { data, isLoading, error } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api<RoomDetail>(`/rooms/${roomId}`),
  });

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
          href="/s/m/inspections"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-card tap-scale"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Room {data.roomNumber}</h1>
          {data.floor != null && <p className="text-xs text-ink-muted">Floor {data.floor}</p>}
        </div>
      </div>

      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Housekeeping status</p>
        <div className="mt-2">
          <StatusBadge status={data.derivedStatus} />
        </div>
        {data.derivedStatus !== 'CLEAN' && (
          <p className="mt-3 text-sm text-ink-muted">
            This room is not in &quot;clean&quot; status. You can still inspect, report lost &amp; found, or report damage if
            needed.
          </p>
        )}
      </Card>

      <div className="flex flex-col gap-3">
        <Button type="button" variant="action" className="min-h-[52px] w-full" onClick={() => setInspectOpen(true)}>
          Inspect room
        </Button>
        <Button type="button" variant="secondary" className="min-h-[52px] w-full" onClick={() => setLostOpen(true)}>
          Report lost &amp; found
        </Button>
        {canReportDamage && (
          <Button
            type="button"
            variant="danger"
            className="min-h-[52px] w-full border-0 bg-red-800 text-white shadow-sm hover:bg-red-900 hover:text-white"
            onClick={() => setDamageOpen(true)}
          >
            Report damage
          </Button>
        )}
        <Button type="button" variant="ghost" className="min-h-[48px] w-full" onClick={() => router.push('/s/m/inspections')}>
          Back to list
        </Button>
      </div>

      <InspectRoomModal
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        roomId={data.id}
        roomNumber={data.roomNumber}
      />
      <LostFoundReportModal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        roomId={data.id}
        roomNumber={data.roomNumber}
      />
      <DamageReportModal
        open={damageOpen}
        onClose={() => setDamageOpen(false)}
        roomId={data.id}
        roomNumber={data.roomNumber}
      />
    </div>
  );
}
