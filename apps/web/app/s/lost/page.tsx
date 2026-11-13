'use client';

import { LostFoundManager } from '@/components/lost-found/LostFoundManager';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';
import { useTranslations } from 'next-intl';

export default function SupervisorLostFoundPage() {
  const t = useTranslations('lostFound');
  const { enterMobile } = useSupervisorMobileMode();

  return <LostFoundManager tone="dark" subtitle={t('subtitle')} onEnterMobile={enterMobile} />;
}
