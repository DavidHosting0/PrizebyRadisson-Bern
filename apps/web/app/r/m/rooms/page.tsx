'use client';

import { ReceptionRoomBoard } from '@/components/reception/ReceptionRoomBoard';

export default function ReceptionMobileRoomsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Rooms</h1>
        <p className="mt-1 text-sm text-sidebar-muted">Live status and assignments</p>
      </div>
      <ReceptionRoomBoard compact />
    </div>
  );
}
