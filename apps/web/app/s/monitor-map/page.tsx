'use client';

import { MonitorMapPage } from '@/components/monitor-map/MonitorMapPage';
import { useSupervisorMobileMode } from '@/lib/supervisor-mobile-context';

export default function SupervisorMonitorMapPage() {
  const { enterMobile } = useSupervisorMobileMode();
  return <MonitorMapPage tone="dark" onEnterMobile={enterMobile} />;
}
