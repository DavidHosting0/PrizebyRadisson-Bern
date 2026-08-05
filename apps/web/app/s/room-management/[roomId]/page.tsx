'use client';

import { RoomManagementDetail } from '@/components/room-management/RoomManagementDetail';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

export default function SupervisorRoomManagementDetailPage({
  params,
}: {
  params: { roomId: string };
}) {
  const { enterMobile } = useSupervisorMobileMode();

  return (
    <RoomManagementDetail
      roomId={params.roomId}
      listPath="/s/room-management"
      reservationsPath="/r/reservations"
      tone="dark"
      onEnterMobile={enterMobile}
    />
  );
}
