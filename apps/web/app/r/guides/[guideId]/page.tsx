'use client';

import { useParams } from 'next/navigation';
import { GuideReader } from '@/components/guides/GuideReader';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ReceptionGuideDetailPage() {
  const params = useParams();
  const guideId = params.guideId as string;
  const { enterMobile } = useReceptionMobileMode();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome title="Guides" actions={<AppChromeTools onEnterMobile={enterMobile} />} />
      <AppPageBody>
        <div className="p-4 md:p-6">
          <GuideReader guideId={guideId} />
        </div>
      </AppPageBody>
    </div>
  );
}
