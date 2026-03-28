'use client';

import { ReceptionRoomBoard } from '@/components/reception/ReceptionRoomBoard';

export default function ReceptionRoomsPage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Rooms</h1>
        <p className="mt-1 text-sm text-ink-muted">Live status, assignments, and cleaning progress.</p>
      </div>
      <ReceptionRoomBoard />
    </div>
  );
}
