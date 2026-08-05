'use client';

import { MonitorMapPage } from '@/components/monitor-map/MonitorMapPage';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionMonitorMapPage() {
  const { enterMobile } = useReceptionMobileMode();
  return <MonitorMapPage tone="dark" onEnterMobile={enterMobile} />;
}
