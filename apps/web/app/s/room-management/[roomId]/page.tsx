'use client';

import { RoomManagementDetail } from '@/components/room-management/RoomManagementDetail';

export default function SupervisorRoomManagementDetailPage({
  params,
}: {
  params: { roomId: string };
}) {
  return (
    <RoomManagementDetail
      roomId={params.roomId}
      listPath="/s/room-management"
      reservationsPath="/r/reservations"
    />
  );
}
