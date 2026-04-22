'use client';

import { ReceptionRoomBoard } from '@/components/reception/ReceptionRoomBoard';

export default function ReceptionMobileRoomsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Rooms</h1>
        <p className="mt-1 text-sm text-ink-muted">Live status and cleaning progress</p>
      </div>
      <ReceptionRoomBoard compact />
    </div>
  );
}
