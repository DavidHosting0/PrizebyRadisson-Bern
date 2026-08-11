'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import type { FloorPlanRoom } from '@/components/rooms/RoomFloorPlan';
import { RoomFloorPlan } from '@/components/rooms/RoomFloorPlan';
import { RoomSlideOver } from '@/components/supervisor/RoomSlideOver';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

export default function SupervisorFloorPlanPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useSupervisorMobileMode();
  const [panelRoomId, setPanelRoomId] = useState<string | null>(null);

  const { data: rooms = [] } = useQuery({
    ...roomsListQueryOptions<FloorPlanRoom>(),
    refetchInterval: 15000,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={tNav('floorPlan')}
        description={tNav('floorPlanDescriptionSupervisor')}
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />

      <AppPageBody>
        <div className="p-4 md:p-6">
          <div className={APP_DARK_CARD + ' p-4 md:p-6'}>
            <RoomFloorPlan rooms={rooms} onRoomClick={(id) => setPanelRoomId(id)} />
          </div>
        </div>
      </AppPageBody>

      <RoomSlideOver roomId={panelRoomId} open={!!panelRoomId} onClose={() => setPanelRoomId(null)} />
    </div>
  );
}
