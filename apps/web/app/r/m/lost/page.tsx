'use client';

import { LostFoundManager } from '@/components/lost-found/LostFoundManager';
import { useTranslations } from 'next-intl';

export default function ReceptionMobileLostPage() {
  const t = useTranslations('lostFound');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LostFoundManager tone="dark" subtitle={t('subtitleMobile')} />
    </div>
  );
}
