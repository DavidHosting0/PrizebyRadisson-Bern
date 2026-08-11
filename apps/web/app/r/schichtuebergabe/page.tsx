'use client';

import { ShiftNotesBoard } from '@/components/shift-notes/ShiftNotesBoard';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionShiftNotesPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppPageChrome title={tNav('shiftHandover')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody className="flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col p-4 md:p-6">
          <ShiftNotesBoard />
        </div>
      </AppPageBody>
    </div>
  );
}
