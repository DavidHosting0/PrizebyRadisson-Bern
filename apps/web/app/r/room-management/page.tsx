'use client';

import { useTranslations } from 'next-intl';
import { RoomManagementBoard } from '@/components/room-management/RoomManagementBoard';
import { PageHeader } from '@/components/ui/PageShell';
import { AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionRoomManagementPage() {
  const t = useTranslations('roomManagement');
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        tone="dark"
        title={t('title')}
        description={t('description')}
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />
      <AppPageBody>
        <div className="p-4 md:p-6">
          <RoomManagementBoard basePath="/r/room-management" tone="dark" />
        </div>
      </AppPageBody>
    </div>
  );
}
