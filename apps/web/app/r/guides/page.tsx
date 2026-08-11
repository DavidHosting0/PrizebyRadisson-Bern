'use client';

import { GuidesBrowser } from '@/components/guides/GuidesBrowser';
import { useTranslations } from 'next-intl';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionGuidesPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title={tNav('guides')} actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="p-4 md:p-6">
          <GuidesBrowser />
        </div>
      </AppPageBody>
    </div>
  );
}
