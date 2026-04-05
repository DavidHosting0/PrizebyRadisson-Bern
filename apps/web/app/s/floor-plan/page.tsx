'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { FloorPlanRoom } from '@/components/rooms/RoomFloorPlan';
import { RoomFloorPlan } from '@/components/rooms/RoomFloorPlan';
import { RoomSlideOver } from '@/components/supervisor/RoomSlideOver';

export default function SupervisorFloorPlanPage() {
  const [panelRoomId, setPanelRoomId] = useState<string | null>(null);

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', 'floor-plan'],
    queryFn: () => api<FloorPlanRoom[]>('/rooms'),
  });

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Floor plan</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Room locations by floor with live housekeeping status. Open a room for cleaning history, photos, and maintenance.
        </p>
      </div>
      <RoomFloorPlan rooms={rooms} onRoomClick={(id) => setPanelRoomId(id)} />
      <RoomSlideOver roomId={panelRoomId} open={!!panelRoomId} onClose={() => setPanelRoomId(null)} />
    </div>
  );
}
