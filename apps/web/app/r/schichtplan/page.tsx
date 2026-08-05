'use client';

import { RosterView } from '@/components/schedule/RosterView';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionRosterPage() {
  const { enterMobile } = useReceptionMobileMode();
  return <RosterView tone="dark" onEnterMobile={enterMobile} />;
}
