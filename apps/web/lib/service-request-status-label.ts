import type { useTranslations } from 'next-intl';

type RequestsPageT = ReturnType<typeof useTranslations<'reception.requestsPage'>>;

export function serviceRequestStatusLabel(status: string, t: RequestsPageT): string {
  const map: Record<string, string> = {
    OPEN: t('statusOpen'),
    CREATED: t('statusCreated'),
    CLAIMED: t('statusClaimed'),
    IN_PROGRESS: t('statusInProgress'),
    RESOLVED: t('statusResolved'),
    CANCELLED: t('statusCancelled'),
  };
  return map[status] ?? status.replace(/_/g, ' ').toLowerCase();
}
