'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { RoomSuggestion } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { AppPageBody, AppPageChrome, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

type RoomSuggestionListItem = {
  reservationId: string;
  guestName: string | null;
  roomType: string | null;
  nights: number | null;
  numPax: number | null;
  vipDesc: string | null;
  tier: string | null;
  suggestion: RoomSuggestion | null;
};

const REASON_KEYS = [
  'vip',
  'premium',
  'repeat',
  'one_night',
  'long_stay',
  'three_pax',
  'no_basement',
  'not_ready',
  'category_not_ready',
  'overbook_view',
  'overbook_corner',
  'overbook_standard',
  'wheelchair',
] as const;

export default function RoomSuggestionsPage() {
  const tNav = useTranslations('nav');
  const t = useTranslations('roomSuggest');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { enterMobile } = useReceptionMobileMode();
  const [search, setSearch] = useState('');

  const listQuery = useQuery({
    queryKey: ['room-suggestions', 'plan'],
    queryFn: () => api<{ items: RoomSuggestionListItem[] }>('/reservations/room-suggestions'),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) => {
      const hay = [row.guestName, row.reservationId, row.roomType, row.suggestion?.roomNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [listQuery.data, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={tNav('roomSuggestions')}
        description={t('description')}
        actions={<AppChromeTools onEnterMobile={enterMobile} />}
      />
      <AppPageBody>
        <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
          <div className={`${APP_DARK_CARD} overflow-hidden`}>
            <div className="border-b border-sidebar-border/60 px-4 py-3">
              <input
                type="search"
                placeholder={t('search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${APP_DARK_INPUT} w-full py-2.5`}
              />
            </div>
            {listQuery.isLoading ? (
              <p className="px-6 py-10 text-sm text-sidebar-muted">{tCommon('loading')}</p>
            ) : listQuery.isError ? (
              <p className="px-6 py-10 text-sm text-red-300">{tCommon('error')}</p>
            ) : rows.length === 0 ? (
              <p className="px-6 py-10 text-sm text-sidebar-muted">{t('empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-sidebar-muted">
                    <tr className="border-b border-sidebar-border/60">
                      <th className="px-4 py-3 font-medium">{t('guest')}</th>
                      <th className="px-4 py-3 font-medium">{t('reservation')}</th>
                      <th className="px-4 py-3 font-medium">{t('booked')}</th>
                      <th className="px-4 py-3 font-medium">{t('suggested')}</th>
                      <th className="px-4 py-3 font-medium">{t('status')}</th>
                      <th className="px-4 py-3 font-medium">{t('reasons')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const suggestion = row.suggestion;
                      return (
                        <tr
                          key={row.reservationId}
                          className="cursor-pointer border-b border-sidebar-border/40 text-white hover:bg-white/5"
                          onClick={() => router.push(`/r/reservations/${row.reservationId}`)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">{row.guestName || '—'}</div>
                            <div className="text-xs text-sidebar-muted">
                              {t('nights', { count: row.nights ?? 1 })}
                              {row.numPax ? ` · ${row.numPax}` : ''}
                              {row.vipDesc ? ` · ${row.vipDesc}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums">{row.reservationId}</td>
                          <td className="px-4 py-3 text-sidebar-muted">{row.roomType || '—'}</td>
                          <td className="px-4 py-3 font-semibold tabular-nums">
                            {suggestion ? suggestion.roomNumber.padStart(4, '0') : t('none')}
                            {suggestion?.floor != null ? (
                              <span className="ml-2 text-xs font-normal text-sidebar-muted">
                                {t('floor', { floor: suggestion.floor })}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            {suggestion ? (suggestion.readyNow ? t('ready') : t('dirty')) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sidebar-muted">
                            {suggestion
                              ? suggestion.reasons
                                  .map((reason) =>
                                    (REASON_KEYS as readonly string[]).includes(reason)
                                      ? t(`reasons.${reason}` as 'reasons.vip')
                                      : reason,
                                  )
                                  .join(' · ')
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </AppPageBody>
    </div>
  );
}
