import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ReviewJobStatus,
  ReviewMentionPolarity,
  ReviewPriority,
  ReviewSentiment,
  ReviewSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewAnalyzerSettingsService } from './review-analyzer-settings.service';
import { ReviewImportService } from './review-import.service';
import { ReviewAnalyticsService } from './review-analytics.service';
import { ReviewExportService } from './review-export.service';
import { ReviewAiService } from './review-ai.service';
import { repairStoredScore, dedupeReviewBlob, buildReviewExternalId, buildReviewSoftKey } from './booking.importer';
import {
  resolveReviewPeriod,
  REVIEW_PERIOD_KEYS,
  type ReviewPeriodKey,
} from './review-utils';

export type ReviewListQuery = {
  q?: string;
  from?: string;
  to?: string;
  minScore?: number;
  maxScore?: number;
  sentiment?: ReviewSentiment;
  language?: string;
  country?: string;
  travelType?: string;
  topicId?: string;
  clusterId?: string;
  priority?: ReviewPriority;
  polarity?: ReviewMentionPolarity;
  source?: ReviewSource;
  take?: number;
  skip?: number;
};

@Injectable()
export class ReviewAnalyzerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsSvc: ReviewAnalyzerSettingsService,
    private readonly imports: ReviewImportService,
    private readonly analytics: ReviewAnalyticsService,
    private readonly exporter: ReviewExportService,
    private readonly ai: ReviewAiService,
  ) {}

  async onBootstrap() {
    await this.ai.ensureTaxonomy();
    await this.failStaleImportJobs();
    await this.repairBogusScores();
    await this.repairDuplicatedReviewTexts();
    await this.repairDuplicateReviews();
  }

  /** Mark orphaned RUNNING jobs (e.g. after PM2 restart / crash) as FAILED. */
  async failStaleImportJobs(maxAgeMinutes = 8) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
    const result = await this.prisma.reviewImportJob.updateMany({
      where: {
        status: ReviewJobStatus.RUNNING,
        OR: [{ startedAt: { lt: cutoff } }, { startedAt: null, createdAt: { lt: cutoff } }],
      },
      data: {
        status: ReviewJobStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: `stale RUNNING job auto-failed after ${maxAgeMinutes}m (process restart or hang)`,
      },
    });
    return { failed: result.count };
  }

  /** Fix scores like 1010 / 9.1 that came from duplicated Booking DOM text or bad repair. */
  async repairBogusScores() {
    const bad = await this.prisma.guestReview.findMany({
      where: {
        OR: [{ score: { gt: 10 } }, { score: { lt: 1 } }],
      },
      select: { id: true, score: true },
    });
    // Also fix non-integers in range (Booking guest scores are whole numbers only)
    const maybeFrac = await this.prisma.guestReview.findMany({
      where: { score: { gte: 1, lte: 10 } },
      select: { id: true, score: true },
    });
    const rows = [
      ...bad,
      ...maybeFrac.filter((r) => !Number.isInteger(r.score)),
    ];
    const seen = new Set<string>();
    let fixed = 0;
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const next = repairStoredScore(row.score);
      if (next != null && next !== row.score) {
        await this.prisma.guestReview.update({ where: { id: row.id }, data: { score: next } });
        fixed++;
      }
    }
    if (fixed > 0) {
      const s = await this.settingsSvc.get();
      await this.analytics.recomputeMetrics(s.hotelKey).catch(() => undefined);
    }
    return { scanned: rows.length, fixed };
  }

  /** Collapse duplicated positive/negative/full text lines from parent+span scrape. */
  async repairDuplicatedReviewTexts() {
    const rows = await this.prisma.guestReview.findMany({
      select: { id: true, positiveText: true, negativeText: true, fullText: true },
    });
    let fixed = 0;
    for (const row of rows) {
      const positiveText = dedupeReviewBlob(row.positiveText);
      const negativeText = dedupeReviewBlob(row.negativeText);
      const fullDeduped = dedupeReviewBlob(row.fullText);
      // Keep a title line if fullText had one that isn't just the pos/neg blob
      const origLines = (row.fullText || '')
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
      const uniqueOrig = [...new Set(origLines)];
      const titleGuess =
        uniqueOrig.find(
          (l) => l !== positiveText && l !== negativeText && !positiveText?.includes(l) && !negativeText?.includes(l),
        ) ?? null;
      const fullText =
        [titleGuess, positiveText, negativeText].filter(Boolean).join('\n\n') ||
        fullDeduped ||
        row.fullText;

      if (
        positiveText !== row.positiveText ||
        negativeText !== row.negativeText ||
        fullText !== row.fullText
      ) {
        await this.prisma.guestReview.update({
          where: { id: row.id },
          data: {
            positiveText,
            negativeText,
            fullText,
          },
        });
        fixed++;
      }
    }
    return { scanned: rows.length, fixed };
  }

  /**
   * Merge/delete near-duplicate GuestReviews (same guest + day + score, or same stable id).
   * Keeps the oldest row; deletes newer copies (cascades analysis/mentions).
   */
  async repairDuplicateReviews() {
    const rows = await this.prisma.guestReview.findMany({
      where: { source: ReviewSource.BOOKING },
      orderBy: { importedAt: 'asc' },
      select: {
        id: true,
        externalId: true,
        guestName: true,
        reviewedAt: true,
        score: true,
        positiveText: true,
        negativeText: true,
        fullText: true,
        importedAt: true,
      },
    });

    const bySoft = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = buildReviewSoftKey(r);
      if (!bySoft.has(key)) bySoft.set(key, []);
      bySoft.get(key)!.push(r);
    }

    let deleted = 0;
    let rekeyed = 0;

    for (const group of bySoft.values()) {
      if (group.length < 2) {
        // Still migrate single rows to stable externalId when possible
        const r = group[0]!;
        const title =
          (r.fullText || '').split(/\n+/)[0]?.trim() &&
          (r.fullText || '').split(/\n+/)[0]!.trim() !== (dedupeReviewBlob(r.positiveText) ?? '')
            ? (r.fullText || '').split(/\n+/)[0]!.trim()
            : '';
        const stable = buildReviewExternalId({
          guestName: r.guestName,
          reviewedAt: r.reviewedAt,
          score: r.score,
          title,
          positiveText: r.positiveText,
          negativeText: r.negativeText,
        });
        if (stable !== r.externalId) {
          const clash = await this.prisma.guestReview.findUnique({
            where: { source_externalId: { source: ReviewSource.BOOKING, externalId: stable } },
          });
          if (!clash) {
            await this.prisma.guestReview.update({
              where: { id: r.id },
              data: { externalId: stable },
            });
            rekeyed++;
          }
        }
        continue;
      }

      // Prefer keep: best deduped text, earliest import
      const keep = group[0]!;
      const title =
        (keep.fullText || '').split(/\n+/)[0]?.trim() &&
        (keep.fullText || '').split(/\n+/)[0]!.trim() !== (dedupeReviewBlob(keep.positiveText) ?? '')
          ? (keep.fullText || '').split(/\n+/)[0]!.trim()
          : '';
      const stable = buildReviewExternalId({
        guestName: keep.guestName,
        reviewedAt: keep.reviewedAt,
        score: keep.score,
        title,
        positiveText: keep.positiveText,
        negativeText: keep.negativeText,
      });

      // Merge best text fields onto keep
      let bestPos = dedupeReviewBlob(keep.positiveText);
      let bestNeg = dedupeReviewBlob(keep.negativeText);
      let bestFull: string = dedupeReviewBlob(keep.fullText) ?? keep.fullText;
      for (const g of group) {
        const p = dedupeReviewBlob(g.positiveText);
        const n = dedupeReviewBlob(g.negativeText);
        const f = dedupeReviewBlob(g.fullText);
        if ((p?.length ?? 0) > (bestPos?.length ?? 0)) bestPos = p;
        if ((n?.length ?? 0) > (bestNeg?.length ?? 0)) bestNeg = n;
        if (f && f.length > bestFull.length) bestFull = f;
      }

      const clash = await this.prisma.guestReview.findUnique({
        where: { source_externalId: { source: ReviewSource.BOOKING, externalId: stable } },
      });
      await this.prisma.guestReview.update({
        where: { id: keep.id },
        data: {
          externalId: clash && clash.id !== keep.id ? keep.externalId : stable,
          positiveText: bestPos,
          negativeText: bestNeg,
          fullText: bestFull || keep.fullText,
          score: repairStoredScore(keep.score) ?? keep.score,
        },
      });

      for (const g of group.slice(1)) {
        await this.prisma.guestReview.delete({ where: { id: g.id } });
        deleted++;
      }
      rekeyed++;
    }

    if (deleted > 0) {
      const s = await this.settingsSvc.get();
      await this.analytics.recomputeMetrics(s.hotelKey).catch(() => undefined);
    }
    return { groups: bySoft.size, deleted, rekeyed };
  }

  async listReviews(query: ReviewListQuery) {
    const settings = await this.settingsSvc.get();
    const take = Math.min(query.take ?? 50, 200);
    const skip = query.skip ?? 0;
    const where: Prisma.GuestReviewWhereInput = {
      hotelKey: settings.hotelKey,
      ...(query.source ? { source: query.source } : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.country ? { guestCountry: query.country } : {}),
      ...(query.travelType ? { travelType: query.travelType } : {}),
      ...(query.minScore != null || query.maxScore != null
        ? {
            score: {
              ...(query.minScore != null ? { gte: query.minScore } : {}),
              ...(query.maxScore != null ? { lte: query.maxScore } : {}),
            },
          }
        : {}),
      ...(query.from || query.to
        ? {
            reviewedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.sentiment ? { analysis: { sentiment: query.sentiment } } : {}),
      ...(query.q
        ? {
            OR: [
              { fullText: { contains: query.q, mode: 'insensitive' } },
              { positiveText: { contains: query.q, mode: 'insensitive' } },
              { negativeText: { contains: query.q, mode: 'insensitive' } },
              { guestName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.topicId || query.clusterId || query.priority || query.polarity
        ? {
            mentions: {
              some: {
                ...(query.topicId ? { topicId: query.topicId } : {}),
                ...(query.clusterId ? { clusterId: query.clusterId } : {}),
                ...(query.priority ? { priority: query.priority } : {}),
                ...(query.polarity ? { polarity: query.polarity } : {}),
              },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.guestReview.findMany({
        where,
        include: {
          analysis: true,
          mentions: { include: { topic: true, cluster: true } },
          categoryScores: true,
        },
        orderBy: { reviewedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.guestReview.count({ where }),
    ]);
    return { items, total, take, skip };
  }

  async getReview(id: string) {
    const row = await this.prisma.guestReview.findUnique({
      where: { id },
      include: {
        analysis: true,
        mentions: { include: { topic: true, cluster: true } },
        categoryScores: true,
      },
    });
    if (!row) throw new NotFoundException('Review not found');
    return row;
  }

  async overview() {
    const s = await this.settingsSvc.get();
    return this.analytics.overview(s.hotelKey);
  }

  async daily(opts?: { limit?: number; from?: string; to?: string }) {
    const s = await this.settingsSvc.get();
    const from = opts?.from ? new Date(`${opts.from.slice(0, 10)}T00:00:00.000Z`) : undefined;
    const to = opts?.to ? new Date(`${opts.to.slice(0, 10)}T23:59:59.999Z`) : undefined;
    const hasRange = Boolean(from || to);
    return this.prisma.dailyReviewMetric.findMany({
      where: {
        hotelKey: s.hotelKey,
        ...(hasRange
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: hasRange ? 'asc' : 'desc' },
      take: hasRange ? Math.min(opts?.limit ?? 800, 800) : (opts?.limit ?? 60),
    });
  }

  async weekly(opts?: { limit?: number; from?: string; to?: string }) {
    const s = await this.settingsSvc.get();
    const from = opts?.from ? new Date(`${opts.from.slice(0, 10)}T00:00:00.000Z`) : undefined;
    const to = opts?.to ? new Date(`${opts.to.slice(0, 10)}T23:59:59.999Z`) : undefined;
    const hasRange = Boolean(from || to);
    return this.prisma.weeklyReviewMetric.findMany({
      where: {
        hotelKey: s.hotelKey,
        ...(hasRange
          ? {
              weekStart: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { weekStart: hasRange ? 'asc' : 'desc' },
      take: hasRange ? Math.min(opts?.limit ?? 120, 120) : (opts?.limit ?? 26),
    });
  }

  async monthly(opts?: { limit?: number; from?: string; to?: string }) {
    const s = await this.settingsSvc.get();
    const hasRange = Boolean(opts?.from || opts?.to);
    if (!hasRange) {
      return this.prisma.monthlyReviewMetric.findMany({
        where: { hotelKey: s.hotelKey },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: opts?.limit ?? 24,
      });
    }
    const rows = await this.prisma.monthlyReviewMetric.findMany({
      where: { hotelKey: s.hotelKey },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      take: 120,
    });
    const fromY = opts?.from ? Number(opts.from.slice(0, 4)) : 0;
    const fromM = opts?.from ? Number(opts.from.slice(5, 7)) : 1;
    const toY = opts?.to ? Number(opts.to.slice(0, 4)) : 9999;
    const toM = opts?.to ? Number(opts.to.slice(5, 7)) : 12;
    return rows.filter((r) => {
      const key = r.year * 100 + r.month;
      return key >= fromY * 100 + fromM && key <= toY * 100 + toM;
    });
  }

  async problems(periodKey: string = 'month') {
    const key = (REVIEW_PERIOD_KEYS.includes(periodKey as ReviewPeriodKey)
      ? periodKey
      : 'month') as ReviewPeriodKey;
    const range = resolveReviewPeriod(key);
    const s = await this.settingsSvc.get();

    const reviewDateFilter = (from: Date | null, to: Date) => ({
      hotelKey: s.hotelKey,
      ...(from ? { reviewedAt: { gte: from, lte: to } } : { reviewedAt: { lte: to } }),
    });

    const loadNegativeMentions = async (from: Date | null, to: Date) =>
      this.prisma.reviewMention.findMany({
        where: {
          polarity: ReviewMentionPolarity.NEGATIVE,
          clusterId: { not: null },
          review: reviewDateFilter(from, to),
        },
        select: {
          id: true,
          clusterId: true,
          reviewId: true,
          topicId: true,
        },
      });

    // Negative reviews = sentiment NEGATIVE, or score ≤ 5, or has ≥1 negative mention
    const loadNegativeReviewIds = async (from: Date | null, to: Date) => {
      const rows = await this.prisma.guestReview.findMany({
        where: {
          ...reviewDateFilter(from, to),
          OR: [
            { analysis: { sentiment: ReviewSentiment.NEGATIVE } },
            { score: { lte: 5 } },
            { mentions: { some: { polarity: ReviewMentionPolarity.NEGATIVE } } },
          ],
        },
        select: { id: true },
      });
      return new Set(rows.map((r) => r.id));
    };

    const [clusters, curMentions, prevMentions, negReviewIds, prevNegReviewIds] =
      await Promise.all([
        this.prisma.reviewProblemCluster.findMany({
          include: { topics: { include: { topic: true } } },
        }),
        loadNegativeMentions(range.from, range.to),
        range.prevFrom && range.prevTo
          ? loadNegativeMentions(range.prevFrom, range.prevTo)
          : Promise.resolve([] as Array<{ id: string; clusterId: string | null; reviewId: string; topicId: string }>),
        loadNegativeReviewIds(range.from, range.to),
        range.prevFrom && range.prevTo
          ? loadNegativeReviewIds(range.prevFrom, range.prevTo)
          : Promise.resolve(new Set<string>()),
      ]);

    const negTotal = negReviewIds.size || 1;
    const prevNegTotal = prevNegReviewIds.size || 1;

    const byCluster = (mentions: typeof curMentions) => {
      const map = new Map<string, { mentionCount: number; reviewIds: Set<string> }>();
      for (const m of mentions) {
        if (!m.clusterId) continue;
        if (!map.has(m.clusterId)) map.set(m.clusterId, { mentionCount: 0, reviewIds: new Set() });
        const row = map.get(m.clusterId)!;
        row.mentionCount++;
        row.reviewIds.add(m.reviewId);
      }
      return map;
    };

    const cur = byCluster(curMentions);
    const prev = byCluster(prevMentions);

    const items = clusters
      .map((c) => {
        const stats = cur.get(c.id) ?? { mentionCount: 0, reviewIds: new Set<string>() };
        const prevStats = prev.get(c.id) ?? { mentionCount: 0, reviewIds: new Set<string>() };
        const reviewCount = stats.reviewIds.size;
        const prevReviewCount = prevStats.reviewIds.size;
        const shareOfNegativePct = (reviewCount / negTotal) * 100;
        const prevShare = (prevReviewCount / prevNegTotal) * 100;
        const trendPct =
          range.prevFrom == null
            ? null
            : prevReviewCount === 0
              ? reviewCount > 0
                ? 100
                : 0
              : ((reviewCount - prevReviewCount) / prevReviewCount) * 100;

        return {
          id: c.id,
          slug: c.slug,
          title: c.title,
          priority: c.priority,
          rootCauseHypothesis: c.rootCauseHypothesis,
          suggestedAction: c.suggestedAction,
          topics: c.topics,
          mentionCount: stats.mentionCount,
          reviewCount,
          /** % of negative reviews in the period that mention this problem */
          shareOfNegativePct: Math.round(shareOfNegativePct * 10) / 10,
          prevReviewCount,
          prevShareOfNegativePct: Math.round(prevShare * 10) / 10,
          /** % change in linked negative-review count vs previous period */
          trendPct: trendPct == null ? null : Math.round(trendPct * 10) / 10,
          // legacy aliases so old clients don't break
          negativePct: Math.round(shareOfNegativePct * 10) / 10,
        };
      })
      .filter((c) => c.mentionCount > 0 || key === 'all')
      .sort((a, b) => b.reviewCount - a.reviewCount || b.mentionCount - a.mentionCount);

    // When "all", include empty clusters too (already filtered only by mention when not all)
    const allItems =
      key === 'all'
        ? clusters
            .map((c) => {
              const existing = items.find((i) => i.id === c.id);
              if (existing) return existing;
              return {
                id: c.id,
                slug: c.slug,
                title: c.title,
                priority: c.priority,
                rootCauseHypothesis: c.rootCauseHypothesis,
                suggestedAction: c.suggestedAction,
                topics: c.topics,
                mentionCount: 0,
                reviewCount: 0,
                shareOfNegativePct: 0,
                prevReviewCount: 0,
                prevShareOfNegativePct: 0,
                trendPct: null as number | null,
                negativePct: 0,
              };
            })
            .sort((a, b) => b.reviewCount - a.reviewCount)
        : items;

    return {
      period: {
        key: range.key,
        label: range.label,
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
        prevFrom: range.prevFrom?.toISOString() ?? null,
        prevTo: range.prevTo?.toISOString() ?? null,
      },
      negativeReviewCount: negReviewIds.size,
      items: allItems,
    };
  }

  async problemReviews(clusterId: string, periodKey: string = 'month') {
    const key = (REVIEW_PERIOD_KEYS.includes(periodKey as ReviewPeriodKey)
      ? periodKey
      : 'month') as ReviewPeriodKey;
    const range = resolveReviewPeriod(key);
    return this.listReviews({
      clusterId,
      polarity: ReviewMentionPolarity.NEGATIVE,
      take: 100,
      from: range.from?.toISOString(),
      to: range.to.toISOString(),
    });
  }

  async strengths() {
    const grouped = await this.prisma.reviewMention.groupBy({
      by: ['topicId'],
      where: { polarity: ReviewMentionPolarity.POSITIVE },
      _count: { topicId: true },
      orderBy: { _count: { topicId: 'desc' } },
      take: 50,
    });
    const topics = await this.prisma.reviewTopic.findMany({
      where: { id: { in: grouped.map((g) => g.topicId) } },
    });
    const name = new Map(topics.map((t) => [t.id, t]));
    const result = [];
    for (const g of grouped) {
      const total = await this.prisma.reviewMention.count({ where: { topicId: g.topicId } });
      const positive = g._count.topicId;
      result.push({
        topicId: g.topicId,
        topic: name.get(g.topicId),
        mentions: positive,
        positivePct: total ? (positive / total) * 100 : 100,
      });
    }
    return result;
  }

  async strengthReviews(topicId: string) {
    return this.listReviews({ topicId, polarity: ReviewMentionPolarity.POSITIVE, take: 100 });
  }

  async trends(from?: string, to?: string) {
    const range = from || to ? { from, to } : undefined;
    const [daily, weekly, monthly] = await Promise.all([
      range ? this.daily({ ...range, limit: 800 }) : this.daily({ limit: 90 }).then((r) => r.reverse()),
      range ? this.weekly({ ...range, limit: 120 }) : this.weekly({ limit: 52 }).then((r) => r.reverse()),
      range ? this.monthly({ ...range, limit: 60 }) : this.monthly({ limit: 36 }).then((r) => [...r].reverse()),
    ]);
    return { daily, weekly, monthly };
  }

  async categoryScoreTrends() {
    const s = await this.settingsSvc.get();
    const months = await this.prisma.monthlyReviewMetric.findMany({
      where: { hotelKey: s.hotelKey },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      take: 24,
    });
    return months.map((m) => ({
      year: m.year,
      month: m.month,
      averageScore: m.averageScore,
      categoryScores: m.categoryScores,
    }));
  }

  async alerts(includeAcked = false) {
    const s = await this.settingsSvc.get();
    return this.prisma.reviewAlert.findMany({
      where: {
        hotelKey: s.hotelKey,
        ...(includeAcked ? {} : { acknowledgedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async ackAlert(id: string) {
    return this.prisma.reviewAlert.update({
      where: { id },
      data: { acknowledgedAt: new Date() },
    });
  }

  async reports(periodType?: string) {
    const s = await this.settingsSvc.get();
    return this.prisma.reviewManagementReport.findMany({
      where: {
        hotelKey: s.hotelKey,
        ...(periodType ? { periodType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async importJobs() {
    return this.prisma.reviewImportJob.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
  }

  getSettings() {
    return this.settingsSvc.get();
  }

  updateSettings(partial: Parameters<ReviewAnalyzerSettingsService['update']>[0]) {
    return this.settingsSvc.update(partial);
  }

  triggerImport(mode?: 'historical' | 'incremental') {
    return this.imports.startImport({ mode, force: true });
  }

  triggerAnalyze(limit?: number) {
    return this.imports.analyzePending(limit ?? 100);
  }

  recompute() {
    return this.analytics.recomputeMetrics();
  }

  async export(format: 'csv' | 'xlsx' | 'pdf', from?: string, to?: string) {
    const s = await this.settingsSvc.get();
    const fromD = from ? new Date(from) : undefined;
    const toD = to ? new Date(to) : undefined;
    if (format === 'csv') {
      const body = await this.exporter.exportCsv(s.hotelKey, fromD, toD);
      return { contentType: 'text/csv; charset=utf-8', filename: 'reviews.csv', body: Buffer.from(body, 'utf8') };
    }
    if (format === 'xlsx') {
      const body = await this.exporter.exportXlsx(s.hotelKey, fromD, toD);
      return {
        contentType: 'application/vnd.ms-excel',
        filename: 'reviews.xls',
        body,
      };
    }
    const report = await this.prisma.reviewManagementReport.findFirst({
      where: { hotelKey: s.hotelKey },
      orderBy: { createdAt: 'desc' },
    });
    const body = await this.exporter.exportPdf(
      s.hotelKey,
      report?.title ?? 'Review Analyzer Report',
      report?.summaryEn ?? 'No report available yet.',
    );
    return { contentType: 'application/pdf', filename: 'review-report.pdf', body };
  }
}
