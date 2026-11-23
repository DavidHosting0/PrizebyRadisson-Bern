'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { BreakfastForecastDayDto } from '@housekeeping/shared';
import { api } from '@/lib/api';

export function BreakfastForecastBoard() {
  const t = useTranslations('kitchen');
  const tCommon = useTranslations('common');

  const forecastQ = useQuery({
    queryKey: ['breakfast', 'forecast'],
    queryFn: () => api<BreakfastForecastDayDto[]>('/breakfast/forecast'),
    refetchInterval: 60_000,
  });

  const days = forecastQ.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">{t('forecastTitle')}</h1>
        <p className="mt-1 text-sm text-sidebar-muted">{t('forecastHint')}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/10">
        {forecastQ.isLoading ? (
          <p className="p-4 text-sm text-sidebar-muted">{tCommon('loading')}</p>
        ) : days.length === 0 ? (
          <p className="p-4 text-sm text-sidebar-muted">{t('forecastEmpty')}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {days.map((d) => (
              <li
                key={d.serviceDate}
                className="flex items-center justify-between gap-3 px-4 py-4"
              >
                <div>
                  <p className="text-base font-semibold text-white">{d.serviceDate}</p>
                  <p className="text-sm text-sidebar-muted">
                    {t('forecastRooms', { count: d.totalRooms })}
                  </p>
                </div>
                <p className="text-2xl font-semibold text-white">{d.totalPersons}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
