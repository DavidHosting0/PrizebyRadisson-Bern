'use client';

import { RoomManagementDetail } from '@/components/room-management/RoomManagementDetail';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionRoomManagementDetailPage({
  params,
}: {
  params: { roomId: string };
}) {
  const { enterMobile } = useReceptionMobileMode();

  return (
    <RoomManagementDetail
      roomId={params.roomId}
      listPath="/r/room-management"
      reservationsPath="/r/reservations"
      tone="dark"
      onEnterMobile={enterMobile}
    />
  );
}
