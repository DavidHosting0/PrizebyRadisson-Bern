'use client';

import { ReceptionRoomBoard } from '@/components/reception/ReceptionRoomBoard';
import { useTranslations } from 'next-intl';

export default function ReceptionMobileRoomsPage() {
  const tNav = useTranslations('nav');
  const t = useTranslations('reception.roomsPage');

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{tNav('rooms')}</h1>
        <p className="mt-1 text-sm text-sidebar-muted">{t('mobileSubtitle')}</p>
      </div>
      <ReceptionRoomBoard compact />
    </div>
  );
}
