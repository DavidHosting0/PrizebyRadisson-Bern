'use client';

import { ReceptionRoomBoard } from '@/components/reception/ReceptionRoomBoard';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionRoomsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={tNav('rooms')}
        description="Live status and housekeeper assignments"
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />
      <AppPageBody>
        <div className="p-4 md:p-6">
          <ReceptionRoomBoard />
        </div>
      </AppPageBody>
    </div>
  );
}
