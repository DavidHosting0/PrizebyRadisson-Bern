'use client';

import { LostFoundManager } from '@/components/lost-found/LostFoundManager';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionLostFoundPage() {
  const { enterMobile } = useReceptionMobileMode();

  return <LostFoundManager tone="dark" onEnterMobile={enterMobile} />;
}
