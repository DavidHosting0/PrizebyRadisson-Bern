'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useReceptionUi } from '@/app/r/reception-context';
import type { FloorPlanRoom } from '@/components/rooms/RoomFloorPlan';
import { RoomFloorPlan } from '@/components/rooms/RoomFloorPlan';

export default function ReceptionFloorPlanPage() {
  const { openRoom } = useReceptionUi();

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', 'floor-plan'],
    queryFn: () => api<FloorPlanRoom[]>('/rooms'),
  });

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Floor plan</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Visual map of rooms by floor. Click a room to see status, assignments, cleaning photos, and maintenance notes.
        </p>
      </div>
      <RoomFloorPlan rooms={rooms} onRoomClick={(id) => openRoom(id)} />
    </div>
  );
}
