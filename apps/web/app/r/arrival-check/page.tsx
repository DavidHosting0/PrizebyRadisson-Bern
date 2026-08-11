'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ArrivalCheckRunDetail, CheckInListTab, ReservationListItem } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { getFirstAllowedPath, RECEPTION_NAV } from '@/lib/permission-routes';
import {
  ArrivalsTable,
  useArrivalsSortLabel,
  compareArrivalRows,
  type ArrivalsSortDir,
  type ArrivalsSortKey,
} from '@/components/reception/ArrivalsTable';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

export default function ArrivalCheckPage() {
  const tNav = useTranslations('nav');
  const t = useTranslations('reception.arrivalCheck');
  const tReception = useTranslations('reception');
  const tArrivalsTable = useTranslations('reception.arrivalsTable');
  const tCommon = useTranslations('common');
  const sortLabel = useArrivalsSortLabel();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const canArrivalCheck = usePermission('ARRIVAL_CHECK');
  const { enterMobile } = useReceptionMobileMode();
  const [activeTab, setActiveTab] = useState<CheckInListTab>('arrivals');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ArrivalsSortKey>('guest');
  const [sortDir, setSortDir] = useState<ArrivalsSortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [forceRerun, setForceRerun] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const CHECKIN_TABS: { id: CheckInListTab; label: string; empty: string }[] = useMemo(
    () => [
      { id: 'arrivals', label: t('tabArrivals'), empty: t('emptyArrivals') },
      { id: 'queue', label: t('tabQueue'), empty: t('emptyQueue') },
      { id: 'checkInsDone', label: t('tabCheckInsDone'), empty: t('emptyCheckInsDone') },
    ],
    [t],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!canArrivalCheck) router.replace(getFirstAllowedPath(user, RECEPTION_NAV) ?? '/login');
  }, [user, loading, canArrivalCheck, router]);

  const tabMeta = CHECKIN_TABS.find((tab) => tab.id === activeTab)!;

  const listQuery = useQuery({
    queryKey: ['arrival-check', 'lists', activeTab, search],
    queryFn: () => {
      const params = new URLSearchParams({ tab: activeTab });
      if (search.trim()) params.set('q', search.trim());
      return api<ReservationListItem[]>(`/arrival-check/arrivals?${params}`);
    },
    enabled: canArrivalCheck,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });

  const syncMut = useMutation({
    mutationFn: () =>
      api<{ upserted: number; syncedAt: string }>('/arrival-check/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arrival-check', 'lists'] });
    },
  });

  const startMut = useMutation({
    mutationFn: (input: { reservationIds: string[]; forceRerun: boolean }) =>
      api<ArrivalCheckRunDetail>('/arrival-check/runs', {
        method: 'POST',
        body: JSON.stringify({
          reservationIds: input.reservationIds,
          forceRerun: input.forceRerun,
        }),
      }),
    onSuccess: (run) => {
      setStartError(null);
      router.push(`/r/arrival-check/runs/${run.id}`);
    },
    onError: (err) => {
      setStartError((err as Error).message);
    },
  });

  const rows = listQuery.data ?? [];

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => compareArrivalRows(a, b, sortKey) * (sortDir === 'asc' ? 1 : -1));
    return copy;
  }, [rows, sortKey, sortDir]);

  const visibleIds = useMemo(() => sortedRows.map((r) => r.reservationId), [sortedRows]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const showSelection = activeTab === 'arrivals';

  function onSort(column: ArrivalsSortKey) {
    if (sortKey === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column);
      setSortDir('asc');
    }
  }

  function toggleSelection(reservationId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reservationId)) next.delete(reservationId);
      else next.add(reservationId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  const selectedCount = selectedIds.size;

  if (loading || !user || !canArrivalCheck) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[#121a26]">
        <p className="text-sm text-sidebar-muted">{tCommon('loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={tNav('arrivalCheck')}
        description={t('description')}
        actions={
          <>
            <AppChromeTools onEnterMobile={enterMobile} />
            <button
              type="button"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
              className="inline-flex min-h-[40px] items-center justify-center rounded-btn border border-sidebar-border bg-transparent px-4 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              {syncMut.isPending ? tReception('syncing') : t('syncReservations')}
            </button>
          </>
        }
      />

      <AppPageBody>
        <div className="w-full space-y-6 p-4 md:p-6">
          <div className={`${APP_DARK_CARD} overflow-hidden`}>
            <div className="flex flex-wrap gap-1 border-b border-sidebar-border/60 bg-sidebar-hover/40 p-2">
              {CHECKIN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-sidebar text-white shadow-sm ring-1 ring-sidebar-border'
                      : 'text-sidebar-muted hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sidebar-border/60 px-4 py-3">
              <input
                type="search"
                placeholder={tReception('searchGuestResRoom')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${APP_DARK_INPUT} min-h-[40px] min-w-[12rem] flex-1 px-4 py-2.5`}
              />
              {showSelection && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    disabled={sortedRows.length === 0}
                    className="rounded-lg border border-sidebar-border bg-transparent px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {allVisibleSelected ? t('deselectAll') : t('selectAll')}
                  </button>
                  <span className="text-sm text-sidebar-muted">
                    {t('selectedCount', { selected: selectedCount, total: sortedRows.length })}
                  </span>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={forceRerun}
                      onChange={(e) => setForceRerun(e.target.checked)}
                      className="rounded border-sidebar-border"
                    />
                    {t('forceRerun')}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      startMut.mutate({ reservationIds: [...selectedIds], forceRerun })
                    }
                    disabled={selectedCount === 0 || startMut.isPending}
                    className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white transition hover:bg-action/90 disabled:opacity-50"
                  >
                    {startMut.isPending ? t('starting') : t('startCheck')}
                  </button>
                </div>
              )}
            </div>

            {listQuery.isLoading ? (
              <p className="px-6 py-10 text-sm text-sidebar-muted">{tCommon('loading')}</p>
            ) : sortedRows.length === 0 ? (
              <p className="px-6 py-10 text-sm text-sidebar-muted">{tabMeta.empty}</p>
            ) : (
              <ArrivalsTable
                rows={sortedRows}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                selection={
                  showSelection
                    ? {
                        selectedIds,
                        onToggle: toggleSelection,
                        allVisibleSelected,
                        someVisibleSelected,
                      }
                    : undefined
                }
              />
            )}

            {!listQuery.isLoading && sortedRows.length > 0 && (
              <div className="border-t border-sidebar-border/60 px-4 py-2.5 text-xs text-sidebar-muted">
                {t('listFooter', {
                  count: sortedRows.length,
                  tab: tabMeta.label,
                  sort: sortLabel(sortKey),
                  dir:
                    sortDir === 'asc' ? tArrivalsTable('sortAsc') : tArrivalsTable('sortDesc'),
                })}
              </div>
            )}
          </div>

          {(syncMut.isError || startError) && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {startError ?? (syncMut.error as Error).message}
            </p>
          )}
        </div>
      </AppPageBody>
    </div>
  );
}
