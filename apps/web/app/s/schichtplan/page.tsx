'use client';

import { RosterView } from '@/components/schedule/RosterView';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

export default function SupervisorRosterPage() {
  const { enterMobile } = useSupervisorMobileMode();
  return <RosterView tone="dark" onEnterMobile={enterMobile} />;
}
