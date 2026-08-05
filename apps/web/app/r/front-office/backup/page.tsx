'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { FrontOfficeBackupOverview } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { FrontOfficeBackupView } from '@/components/front-office/FrontOfficeBackupView';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function FrontOfficeBackupPage() {
  const t = useTranslations('frontOfficeBackup');
  const { enterMobile } = useReceptionMobileMode();

  const query = useQuery({
    queryKey: ['front-office', 'backup-overview'],
    queryFn: () => api<FrontOfficeBackupOverview>('/front-office/backup-overview'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col print:flex-none">
      <AppPageChrome
        title={t('title')}
        description={t('subtitle')}
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
        className="print:hidden"
      />
      <AppPageBody>
        <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
          {query.isLoading && <p className="text-sm text-sidebar-muted">{t('loading')}</p>}
          {query.isError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {t('loadError')}
            </div>
          )}
          {query.data && <FrontOfficeBackupView data={query.data} />}
        </div>
      </AppPageBody>
    </div>
  );
}
