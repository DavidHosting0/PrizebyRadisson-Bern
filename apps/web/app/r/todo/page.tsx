'use client';

import { ShiftHandoverBoard } from '@/components/shift-handover/ShiftHandoverBoard';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionTodoPage() {
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title="Shift handover" actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="p-4 md:p-6">
          <ShiftHandoverBoard />
        </div>
      </AppPageBody>
    </div>
  );
}
