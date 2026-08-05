'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ReservationBreakdownResponse,
  ReservationCheckInRateResponse,
  ReservationDailySummaryResponse,
  ReservationTimelineResponse,
} from '@housekeeping/shared';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { KpiStat } from '@/components/supervisor/KpiStat';
import { TimelineChart } from '@/components/admin/reservation-stats/TimelineChart';
import { CheckInRateChart } from '@/components/admin/reservation-stats/CheckInRateChart';
import { PipelineAreaChart } from '@/components/admin/reservation-stats/PipelineAreaChart';
import { DailySummaryChart } from '@/components/admin/reservation-stats/DailySummaryChart';
import { BreakdownTable } from '@/components/admin/reservation-stats/BreakdownTable';
import { DateInput } from '@/components/ui/DateInput';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date());
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AdminReservationStatsPage() {
  const { user } = useAuth();
  const t = useTranslations('reservationStats');
  const isAdmin = user?.role === 'ADMIN';

  const [selectedDate, setSelectedDate] = useState(todayIso);
  const isToday = selectedDate === todayIso();

  const timelineQuery = useQuery({
    queryKey: ['reservations', 'analytics', 'timeline', selectedDate],
    queryFn: () =>
      api<ReservationTimelineResponse>(
        `/reservations/analytics/timeline?date=${encodeURIComponent(selectedDate)}`,
      ),
    enabled: isAdmin,
    refetchInterval: isToday ? 60_000 : false,
  });

  const rateQuery = useQuery({
    queryKey: ['reservations', 'analytics', 'check-in-rate', selectedDate],
    queryFn: () =>
      api<ReservationCheckInRateResponse>(
        `/reservations/analytics/check-in-rate?date=${encodeURIComponent(selectedDate)}&bucketMinutes=15`,
      ),
    enabled: isAdmin,
    refetchInterval: isToday ? 60_000 : false,
  });

  const summaryFrom = addDaysIso(selectedDate, -13);
  const dailyQuery = useQuery({
    queryKey: ['reservations', 'analytics', 'daily-summary', summaryFrom, selectedDate],
    queryFn: () =>
      api<ReservationDailySummaryResponse>(
        `/reservations/analytics/daily-summary?from=${encodeURIComponent(summaryFrom)}&to=${encodeURIComponent(selectedDate)}`,
      ),
    enabled: isAdmin,
    refetchInterval: isToday ? 120_000 : false,
  });

  const breakdownQuery = useQuery({
    queryKey: ['reservations', 'analytics', 'breakdown', selectedDate],
    queryFn: () =>
      api<ReservationBreakdownResponse>(
        `/reservations/analytics/breakdown?date=${encodeURIComponent(selectedDate)}`,
      ),
    enabled: isAdmin,
    refetchInterval: isToday ? 60_000 : false,
  });

  const latestPoint = useMemo(() => {
    const points = timelineQuery.data?.points ?? [];
    return points.length > 0 ? points[points.length - 1] : null;
  }, [timelineQuery.data?.points]);

  const loading =
    timelineQuery.isLoading ||
    rateQuery.isLoading ||
    dailyQuery.isLoading ||
    breakdownQuery.isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            <AppChromeTools />
            <label className="flex flex-col gap-1">
              <span className="sr-only">{t('businessDate')}</span>
              <DateInput
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                size="sm"
                className="min-w-[9rem]"
              />
            </label>
          </>
        }
      />
      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
      {timelineQuery.data?.firstDataAt && (
        <p className="text-xs text-sidebar-muted">
          {t('dataNote', {
            from: new Date(timelineQuery.data.firstDataAt).toLocaleString('de-CH', {
              timeZone: 'Europe/Zurich',
            }),
            count: timelineQuery.data.syncCount,
          })}
        </p>
      )}

      {loading && <p className="text-sm text-sidebar-muted">{t('loading')}</p>}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
          {t('kpiSection')}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiStat
            tone="dark"
            label={t('kpiArrivals')}
            value={latestPoint?.arrivals ?? breakdownQuery.data?.totalArrivals ?? 0}
          />
          <KpiStat
            tone="dark"
            label={t('kpiRemaining')}
            value={latestPoint?.remainingCheckIns ?? 0}
          />
          <KpiStat tone="dark" label={t('kpiQueue')} value={latestPoint?.checkInQueue ?? 0} />
          <KpiStat tone="dark" label={t('kpiCheckInDone')} value={latestPoint?.checkInDone ?? 0} />
          <KpiStat tone="dark" label={t('kpiInHouse')} value={latestPoint?.inHouse ?? 0} />
          <KpiStat tone="dark" label={t('kpiDepartures')} value={latestPoint?.departures ?? 0} />
        </div>
      </section>

      {rateQuery.data?.peakWindow && (
        <div className="rounded-2xl border border-action/30 bg-action/10 px-5 py-4 text-sm text-white">
          <span className="font-medium">{t('peakCheckIn')}:</span>{' '}
          {rateQuery.data.peakWindow.label}–
          {new Date(rateQuery.data.peakWindow.bucketEnd).toLocaleTimeString('de-CH', {
            timeZone: 'Europe/Zurich',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}{' '}
          ({rateQuery.data.peakWindow.checkIns} {t('checkIns')})
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">{t('timelineTitle')}</h2>
        <p className="mt-1 text-xs text-ink-muted">{t('timelineHint')}</p>
        <div className="mt-4">
          <TimelineChart points={timelineQuery.data?.points ?? []} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">{t('peakTitle')}</h2>
        <p className="mt-1 text-xs text-ink-muted">{t('peakHint')}</p>
        <div className="mt-4">
          <CheckInRateChart buckets={rateQuery.data?.buckets ?? []} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">{t('pipelineTitle')}</h2>
        <p className="mt-1 text-xs text-ink-muted">{t('pipelineHint')}</p>
        <div className="mt-4">
          <PipelineAreaChart points={timelineQuery.data?.points ?? []} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">{t('dailyTitle')}</h2>
        <p className="mt-1 text-xs text-ink-muted">{t('dailyHint')}</p>
        <div className="mt-4">
          <DailySummaryChart days={dailyQuery.data?.days ?? []} />
        </div>
      </section>

      {breakdownQuery.data && (
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiStat tone="dark" label={t('totalPax')} value={breakdownQuery.data.totalPax} />
            <KpiStat
              tone="dark"
              label={t('avgNights')}
              value={breakdownQuery.data.avgNightsStay ?? '—'}
            />
            <KpiStat
              tone="dark"
              label={t('arrivalCheckDone')}
              value={breakdownQuery.data.arrivalCheckCompleted}
            />
            <KpiStat
              tone="dark"
              label={t('arrivalCheckOpen')}
              value={breakdownQuery.data.arrivalCheckPending}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownTable
              title={t('byRoomType')}
              groups={breakdownQuery.data.byRoomType}
              emptyLabel={t('noBreakdown')}
            />
            <BreakdownTable
              title={t('byMealPlan')}
              groups={breakdownQuery.data.byMealPlan}
              emptyLabel={t('noBreakdown')}
            />
            <BreakdownTable
              title={t('byTier')}
              groups={breakdownQuery.data.byTier}
              emptyLabel={t('noBreakdown')}
            />
          </div>
        </section>
      )}

      <p className="text-xs text-sidebar-muted">{t('disclaimer')}</p>
        </div>
      </AppPageBody>
    </div>
  );
}
