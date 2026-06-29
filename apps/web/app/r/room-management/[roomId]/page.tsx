'use client';

import { RoomManagementDetail } from '@/components/room-management/RoomManagementDetail';

export default function ReceptionRoomManagementDetailPage({
  params,
}: {
  params: { roomId: string };
}) {
  return (
    <RoomManagementDetail
      roomId={params.roomId}
      listPath="/r/room-management"
      reservationsPath="/r/reservations"
    />
  );
}
