'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEmmaIntegrationStatus } from '@/lib/hooks/useEmmaIntegrationStatus';

const DEFAULT_BANNER_MESSAGE = 'EMMA DOWN — BACKUP SYSTEM';

export function EmmaSyncAlertBanner() {
  const t = useTranslations('reception.emmaSyncBanner');
  const tBackup = useTranslations('frontOfficeBackup');
  const { active, message, backupModeReasons, pendingCount } = useEmmaIntegrationStatus();

  if (!active) return null;

  const reasonLabels: Record<string, string> = {
    push: t('reasonPush'),
    reservation_sync: t('reasonReservationSync'),
    manual: t('reasonManual'),
  };

  const sublines = [
    ...backupModeReasons.map((r) => reasonLabels[r] ?? r),
    pendingCount > 0 ? t('pendingPushes', { count: pendingCount }) : null,
  ].filter(Boolean);

  const title =
    !message || message === DEFAULT_BANNER_MESSAGE ? tBackup('bannerTitle') : message;

  return (
    <div
      role="alert"
      className="fixed top-3 right-3 z-[60] max-w-md animate-pulse rounded-lg border-4 border-rose-950 bg-rose-600 px-5 py-4 text-white shadow-[0_8px_32px_rgba(190,18,60,0.55)]"
    >
      <p className="text-base font-black uppercase leading-tight tracking-wider sm:text-lg">{title}</p>
      {sublines.length > 0 ? (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-rose-100">
          {sublines.join(' · ')}
        </p>
      ) : null}
      <Link
        href="/r/front-office/backup"
        className="mt-3 inline-block text-xs font-bold uppercase underline underline-offset-2 hover:text-rose-50"
      >
        {t('openBackupOverview')}
      </Link>
    </div>
  );
}
