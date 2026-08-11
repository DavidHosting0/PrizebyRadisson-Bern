'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useReceptionUi } from '@/app/r/reception-context';
import type { FloorPlanRoom } from '@/components/rooms/RoomFloorPlan';
import { RoomFloorPlan } from '@/components/rooms/RoomFloorPlan';
import { roomsListQueryOptions } from '@/lib/rooms-query';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionFloorPlanPage() {
  const tNav = useTranslations('nav');
  const t = useTranslations('reception.floorPlanPage');
  const { openRoom } = useReceptionUi();
  const { enterMobile } = useReceptionMobileMode();

  const { data: rooms = [] } = useQuery({
    ...roomsListQueryOptions<FloorPlanRoom>(),
    refetchInterval: 15000,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={tNav('floorPlan')}
        description={t('description')}
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />

      <AppPageBody>
        <div className="p-4 md:p-6">
          <div className={APP_DARK_CARD + ' p-4 md:p-6'}>
            <RoomFloorPlan rooms={rooms} onRoomClick={(id) => openRoom(id)} />
          </div>
        </div>
      </AppPageBody>
    </div>
  );
}
