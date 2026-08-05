'use client';

import { LostFoundManager } from '@/components/lost-found/LostFoundManager';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

export default function SupervisorLostFoundPage() {
  const { enterMobile } = useSupervisorMobileMode();

  return (
    <LostFoundManager
      tone="dark"
      subtitle="Review cleaner reports, place items into storage boxes, and track handovers."
      onEnterMobile={enterMobile}
    />
  );
}
