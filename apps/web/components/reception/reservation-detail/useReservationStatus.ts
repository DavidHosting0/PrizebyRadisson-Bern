'use client';

import { useTranslations } from 'next-intl';
import type { ReservationDetail } from '@housekeeping/shared';

export function useReservationStatus() {
  const t = useTranslations('reception.reservationsPage');
  const tDetail = useTranslations('reception.reservationDetail');

  return (data: ReservationDetail) => {
    if (data.checkOut) return { label: t('statusCheckedOut'), className: 'bg-white/10 text-sidebar-muted' };
    if (data.checkIn) return { label: t('statusInHouse'), className: 'bg-emerald-500/15 text-emerald-300' };
    if (data.checkInQueue) return { label: tDetail('statusCheckInQueue'), className: 'bg-amber-500/15 text-amber-300' };
    return { label: tDetail('statusOpen'), className: 'bg-sky-500/15 text-sky-300' };
  };
}

export function useReservationListStatus() {
  const t = useTranslations('reception.reservationsPage');

  return (r: { checkOut?: boolean | null; checkIn?: boolean | null; checkInQueue?: boolean | null }) => {
    if (r.checkOut) return { text: t('statusCheckedOut'), className: 'text-sidebar-muted' };
    if (r.checkIn) return { text: t('statusInHouse'), className: 'text-emerald-300' };
    if (r.checkInQueue) return { text: t('statusQueue'), className: 'text-amber-300' };
    return { text: t('statusArrival'), className: 'text-sky-300' };
  };
}
