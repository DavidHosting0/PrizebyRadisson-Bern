'use client';

import { ComplaintsBoard } from '@/components/complaints/ComplaintsBoard';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionComplaintsPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('complaints')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="p-4 md:p-6">
          <ComplaintsBoard />
        </div>
      </AppPageBody>
    </div>
  );
}
