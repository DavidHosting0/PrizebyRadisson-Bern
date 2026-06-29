'use client';

import { useTranslations } from 'next-intl';
import { RoomManagementBoard } from '@/components/room-management/RoomManagementBoard';
import { PageHeader, PageShell } from '@/components/ui/PageShell';

export default function SupervisorRoomManagementPage() {
  const t = useTranslations('roomManagement');

  return (
    <PageShell>
      <PageHeader title={t('title')} description={t('description')} />
      <RoomManagementBoard basePath="/s/room-management" />
    </PageShell>
  );
}
