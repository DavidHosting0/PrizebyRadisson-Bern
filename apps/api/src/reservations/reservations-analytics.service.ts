import { Injectable } from '@nestjs/common';
import type {
  ReservationBreakdownGroup,
  ReservationBreakdownResponse,
  ReservationCheckInRateBucket,
  ReservationCheckInRateResponse,
  ReservationDailySummaryResponse,
  ReservationDailySummaryRow,
  ReservationTimelinePoint,
  ReservationTimelineResponse,
} from '@housekeeping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnlyFromIso, todayIsoDate } from './reservation-sensitive';

type OverviewSnapshot = {
  checkInDone: number;
  checkInQueue: number;
  checkInPending: number;
  arrivals: number;
  inHouse: number;
  departures: number;
  checkOutToday: number;
  checkOutDone: number;
  checkInBusinessDateIso?: string;
};

type ParsedSyncRun = {
  finishedAt: Date;
  overview: OverviewSnapshot;
  businessDate: string;
};

@Injectable()
export class ReservationsAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async timeline(date?: string): Promise<ReservationTimelineResponse> {
    const targetDate = this.normalizeDate(date);
    const runs = await this.fetchSyncRunsForDateWindow(targetDate);
    const points = this.buildTimelinePoints(runs, targetDate);
    const downsampled = this.downsampleTimeline(points, 5);

    return {
      date: targetDate,
      businessDate: targetDate,
      points: downsampled,
      firstDataAt: downsampled[0]?.at ?? null,
      lastDataAt: downsampled[downsampled.length - 1]?.at ?? null,
      syncCount: runs.length,
    };
  }

  async checkInRate(date?: string, bucketMinutes = 15): Promise<ReservationCheckInRateResponse> {
    const targetDate = this.normalizeDate(date);
    const runs = await this.fetchSyncRunsForDateWindow(targetDate);
    const points = this.buildTimelinePoints(runs, targetDate);
    const buckets = this.buildCheckInRateBuckets(points, bucketMinutes);

    let peak: ReservationCheckInRateResponse['peakWindow'] = null;
    for (const b of buckets) {
      if (!peak || b.checkIns > peak.checkIns) {
        peak = {
          bucketStart: b.bucketStart,
          bucketEnd: b.bucketEnd,
          label: b.label,
          checkIns: b.checkIns,
        };
      }
    }

    const totalCheckIns = buckets.reduce((sum, b) => sum + b.checkIns, 0);

    return {
      date: targetDate,
      bucketMinutes,
      buckets,
      peakWindow: peak && peak.checkIns > 0 ? peak : null,
      totalCheckIns,
    };
  }

  async dailySummary(from?: string, to?: string): Promise<ReservationDailySummaryResponse> {
    const endDate = this.normalizeDate(to ?? todayIsoDate());
    const startDate = this.normalizeDate(
      from ?? this.addDaysIso(endDate, -13),
    );
    if (startDate > endDate) {
      return { from: startDate, to: endDate, days: [] };
    }

    const runs = await this.fetchSyncRunsBetween(
      this.addDaysIso(startDate, -1),
      this.addDaysIso(endDate, 1),
    );

    const byDay = new Map<string, ParsedSyncRun[]>();
    for (const run of runs) {
      if (run.businessDate < startDate || run.businessDate > endDate) continue;
      const list = byDay.get(run.businessDate) ?? [];
      list.push(run);
      byDay.set(run.businessDate, list);
    }

    const days: ReservationDailySummaryRow[] = [];
    for (let d = startDate; d <= endDate; d = this.addDaysIso(d, 1)) {
      const dayRuns = (byDay.get(d) ?? []).sort(
        (a, b) => a.finishedAt.getTime() - b.finishedAt.getTime(),
      );
      if (dayRuns.length === 0) {
        days.push({
          date: d,
          arrivals: 0,
          checkInDone: 0,
          peakQueue: 0,
          minRemainingCheckIns: 0,
          maxRemainingCheckIns: 0,
          syncCount: 0,
        });
        continue;
      }

      const last = dayRuns[dayRuns.length - 1]!.overview;
      let peakQueue = 0;
      let minRemaining = Number.POSITIVE_INFINITY;
      let maxRemaining = 0;

      for (const run of dayRuns) {
        const o = run.overview;
        peakQueue = Math.max(peakQueue, o.checkInQueue);
        const remaining = o.checkInPending + o.checkInQueue;
        minRemaining = Math.min(minRemaining, remaining);
        maxRemaining = Math.max(maxRemaining, remaining);
      }

      days.push({
        date: d,
        arrivals: last.arrivals || last.checkInPending + last.checkInQueue + last.checkInDone,
        checkInDone: last.checkInDone,
        peakQueue,
        minRemainingCheckIns: Number.isFinite(minRemaining) ? minRemaining : 0,
        maxRemainingCheckIns: maxRemaining,
        syncCount: dayRuns.length,
      });
    }

    return { from: startDate, to: endDate, days };
  }

  async breakdown(date?: string): Promise<ReservationBreakdownResponse> {
    const targetDate = this.normalizeDate(date);
    const hotelId = process.env.EMMA_HOTEL_ID?.trim() || 'CHBRNPR';
    const arrivalDate = dateOnlyFromIso(targetDate);

    const rows = await this.prisma.reservationSnapshot.findMany({
      where: { hotelId, arrivalDate },
      select: {
        roomType: true,
        mealPlan: true,
        tier: true,
        numPax: true,
        nightsStay: true,
        arrivalCheckCompletedAt: true,
        inTodayArrivals: true,
        checkInQueue: true,
        inCheckInDone: true,
      },
    });

    const byRoomType = this.groupBreakdown(rows, (r) => r.roomType);
    const byMealPlan = this.groupBreakdown(rows, (r) => r.mealPlan);
    const byTier = this.groupBreakdown(rows, (r) => r.tier);

    const totalPax = rows.reduce((sum, r) => sum + (r.numPax ?? 0), 0);
    const nights = rows.map((r) => r.nightsStay).filter((n): n is number => n != null);
    const avgNightsStay =
      nights.length > 0 ? Math.round((nights.reduce((a, b) => a + b, 0) / nights.length) * 10) / 10 : null;

    return {
      date: targetDate,
      totalArrivals: rows.length,
      totalPax,
      avgNightsStay,
      arrivalCheckCompleted: rows.filter((r) => r.arrivalCheckCompletedAt != null).length,
      arrivalCheckPending: rows.filter((r) => r.arrivalCheckCompletedAt == null).length,
      inTodayArrivals: rows.filter((r) => r.inTodayArrivals).length,
      inQueue: rows.filter((r) => r.checkInQueue && !r.inCheckInDone).length,
      checkInsDone: rows.filter((r) => r.inCheckInDone).length,
      byRoomType,
      byMealPlan,
      byTier,
    };
  }

  private normalizeDate(date?: string): string {
    const trimmed = date?.trim();
    if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    return todayIsoDate();
  }

  private addDaysIso(iso: string, days: number): string {
    const d = dateOnlyFromIso(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private parseOverview(raw: unknown): OverviewSnapshot | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    return {
      checkInDone: Number(o.checkInDone ?? 0),
      checkInQueue: Number(o.checkInQueue ?? 0),
      checkInPending: Number(o.checkInPending ?? 0),
      arrivals: Number(o.arrivals ?? 0),
      inHouse: Number(o.inHouse ?? 0),
      departures: Number(o.departures ?? 0),
      checkOutToday: Number(o.checkOutToday ?? 0),
      checkOutDone: Number(o.checkOutDone ?? 0),
      checkInBusinessDateIso:
        typeof o.checkInBusinessDateIso === 'string' ? o.checkInBusinessDateIso : undefined,
    };
  }

  private businessDateFromOverview(overview: OverviewSnapshot, finishedAt: Date): string {
    if (overview.checkInBusinessDateIso) {
      return overview.checkInBusinessDateIso.slice(0, 10);
    }
    return finishedAt.toISOString().slice(0, 10);
  }

  private async fetchSyncRunsForDateWindow(targetDate: string): Promise<ParsedSyncRun[]> {
    return this.fetchSyncRunsBetween(
      this.addDaysIso(targetDate, -1),
      this.addDaysIso(targetDate, 2),
    ).then((runs) => runs.filter((r) => r.businessDate === targetDate));
  }

  private async fetchSyncRunsBetween(fromIso: string, toIso: string): Promise<ParsedSyncRun[]> {
    const from = dateOnlyFromIso(fromIso);
    const to = dateOnlyFromIso(toIso);
    to.setUTCDate(to.getUTCDate() + 1);

    const rows = await this.prisma.reservationSyncRun.findMany({
      where: {
        status: 'ok',
        finishedAt: { gte: from, lt: to },
      },
      orderBy: { finishedAt: 'asc' },
      select: { finishedAt: true, overview: true },
    });

    const parsed: ParsedSyncRun[] = [];
    for (const row of rows) {
      if (!row.finishedAt) continue;
      const overview = this.parseOverview(row.overview);
      if (!overview) continue;
      parsed.push({
        finishedAt: row.finishedAt,
        overview,
        businessDate: this.businessDateFromOverview(overview, row.finishedAt),
      });
    }
    return parsed;
  }

  private buildTimelinePoints(runs: ParsedSyncRun[], _targetDate: string): ReservationTimelinePoint[] {
    return runs.map((run) => {
      const o = run.overview;
      return {
        at: run.finishedAt.toISOString(),
        checkInDone: o.checkInDone,
        checkInQueue: o.checkInQueue,
        checkInPending: o.checkInPending,
        arrivals: o.arrivals,
        inHouse: o.inHouse,
        departures: o.departures,
        checkOutToday: o.checkOutToday,
        checkOutDone: o.checkOutDone,
        remainingCheckIns: o.checkInPending + o.checkInQueue,
      };
    });
  }

  private downsampleTimeline(
    points: ReservationTimelinePoint[],
    bucketMinutes: number,
  ): ReservationTimelinePoint[] {
    if (points.length <= 1) return points;

    const bucketMs = bucketMinutes * 60_000;
    const buckets = new Map<number, ReservationTimelinePoint>();

    for (const point of points) {
      const t = new Date(point.at).getTime();
      const key = Math.floor(t / bucketMs) * bucketMs;
      buckets.set(key, point);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, p]) => p);
  }

  private buildCheckInRateBuckets(
    points: ReservationTimelinePoint[],
    bucketMinutes: number,
  ): ReservationCheckInRateBucket[] {
    if (points.length < 2) return [];

    const bucketMs = bucketMinutes * 60_000;
    const bucketTotals = new Map<number, number>();

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const curr = points[i]!;
      const delta = Math.max(0, curr.checkInDone - prev.checkInDone);
      if (delta === 0) continue;

      const prevT = new Date(prev.at).getTime();
      const currT = new Date(curr.at).getTime();
      const mid = (prevT + currT) / 2;
      const key = Math.floor(mid / bucketMs) * bucketMs;
      bucketTotals.set(key, (bucketTotals.get(key) ?? 0) + delta);
    }

    const tz = 'Europe/Zurich';
    return [...bucketTotals.entries()]
      .sort(([a], [b]) => a - b)
      .map(([key, checkIns]) => {
        const bucketStart = new Date(key);
        const bucketEnd = new Date(key + bucketMs);
        const label = bucketStart.toLocaleTimeString('de-CH', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        return {
          bucketStart: bucketStart.toISOString(),
          bucketEnd: bucketEnd.toISOString(),
          label,
          checkIns,
        };
      });
  }

  private groupBreakdown<T extends { numPax: number | null }>(
    rows: T[],
    keyFn: (row: T) => string | null,
  ): ReservationBreakdownGroup[] {
    const map = new Map<string, { count: number; totalPax: number }>();
    for (const row of rows) {
      const key = keyFn(row)?.trim() || '—';
      const entry = map.get(key) ?? { count: 0, totalPax: 0 };
      entry.count++;
      entry.totalPax += row.numPax ?? 0;
      map.set(key, entry);
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, count: v.count, totalPax: v.totalPax }))
      .sort((a, b) => b.count - a.count);
  }
}
