'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { FrontOfficeBackupOverview } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { FrontOfficeBackupView } from '@/components/front-office/FrontOfficeBackupView';

export default function FrontOfficeBackupPage() {
  const t = useTranslations('frontOfficeBackup');

  const query = useQuery({
    queryKey: ['front-office', 'backup-overview'],
    queryFn: () => api<FrontOfficeBackupOverview>('/front-office/backup-overview'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return <p className="text-sm text-ink-muted">{t('loading')}</p>;
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {t('loadError')}
      </div>
    );
  }

  if (!query.data) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="print:hidden">
        <h1 className="text-xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
      </div>
      <FrontOfficeBackupView data={query.data} />
    </div>
  );
}
