'use client';

import { useTranslations } from 'next-intl';
import { BreakfastWishesBoard } from '@/components/breakfast-wishes/BreakfastWishesBoard';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionBreakfastWishesPage() {
  const tNav = useTranslations('nav');
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={tNav('breakfastWishes')}
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />
      <AppPageBody>
        <div className="p-4 md:p-6">
          <BreakfastWishesBoard />
        </div>
      </AppPageBody>
    </div>
  );
}
