import { Injectable, Logger } from '@nestjs/common';
import {
  ReviewAlertType,
  ReviewMentionPolarity,
  ReviewPriority,
  ReviewSentiment,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewAnalyzerSettingsService } from './review-analyzer-settings.service';
import { isoWeekParts, startOfUtcDay } from './review-utils';
import { SettingsService } from '../settings/settings.service';
import OpenAI from 'openai';

@Injectable()
export class ReviewAnalyticsService {
  private readonly logger = new Logger(ReviewAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsSvc: ReviewAnalyzerSettingsService,
    private readonly appSettings: SettingsService,
  ) {}

  async recomputeMetrics(hotelKey?: string) {
    const settings = await this.settingsSvc.get();
    const key = hotelKey ?? settings.hotelKey;
    await this.recomputeDaily(key);
    await this.recomputeWeekly(key);
    await this.recomputeMonthly(key);
    await this.refreshClusters(key);
    await this.detectAnomaliesAndAlerts(key);
    await this.ensureReports(key);
  }

  private async reviewsInRange(hotelKey: string, from: Date, to: Date) {
    return this.prisma.guestReview.findMany({
      where: { hotelKey, reviewedAt: { gte: from, lt: to } },
      include: { analysis: true, mentions: { include: { topic: true } } },
    });
  }

  private sentimentPct(rows: Array<{ analysis: { sentiment: ReviewSentiment } | null }>) {
    const withA = rows.filter((r) => r.analysis);
    const n = withA.length || 1;
    const count = (s: ReviewSentiment) =>
      withA.filter((r) => r.analysis!.sentiment === s).length;
    return {
      positivePct: (count(ReviewSentiment.POSITIVE) / n) * 100,
      negativePct: (count(ReviewSentiment.NEGATIVE) / n) * 100,
      mixedPct: (count(ReviewSentiment.MIXED) / n) * 100,
      neutralPct: (count(ReviewSentiment.NEUTRAL) / n) * 100,
    };
  }

  private topThemes(
    rows: Array<{
      mentions: Array<{ polarity: ReviewMentionPolarity; topic: { name: string } }>;
    }>,
    polarity: ReviewMentionPolarity,
    limit = 5,
  ) {
    const map = new Map<string, number>();
    for (const r of rows) {
      for (const m of r.mentions) {
        if (m.polarity !== polarity) continue;
        map.set(m.topic.name, (map.get(m.topic.name) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  async recomputeDaily(hotelKey: string) {
    const oldest = await this.prisma.guestReview.findFirst({
      where: { hotelKey },
      orderBy: { reviewedAt: 'asc' },
      select: { reviewedAt: true },
    });
    if (!oldest) return;
    let day = startOfUtcDay(oldest.reviewedAt);
    const end = startOfUtcDay(new Date());
    end.setUTCDate(end.getUTCDate() + 1);

    while (day < end) {
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      const rows = await this.reviewsInRange(hotelKey, day, next);
      const reviewCount = rows.length;
      const averageScore =
        reviewCount === 0 ? 0 : rows.reduce((s, r) => s + r.score, 0) / reviewCount;
      const pct = this.sentimentPct(rows);
      const topPos = this.topThemes(rows, ReviewMentionPolarity.POSITIVE, 1)[0]?.name ?? null;
      const topNeg = this.topThemes(rows, ReviewMentionPolarity.NEGATIVE, 1)[0]?.name ?? null;

      await this.prisma.dailyReviewMetric.upsert({
        where: { hotelKey_date: { hotelKey, date: day } },
        create: {
          hotelKey,
          date: day,
          reviewCount,
          averageScore,
          ...pct,
          topPositive: topPos,
          topNegative: topNeg,
          topicStats: {
            positive: this.topThemes(rows, ReviewMentionPolarity.POSITIVE),
            negative: this.topThemes(rows, ReviewMentionPolarity.NEGATIVE),
          },
        },
        update: {
          reviewCount,
          averageScore,
          ...pct,
          topPositive: topPos,
          topNegative: topNeg,
          topicStats: {
            positive: this.topThemes(rows, ReviewMentionPolarity.POSITIVE),
            negative: this.topThemes(rows, ReviewMentionPolarity.NEGATIVE),
          },
        },
      });
      day = next;
    }
  }

  async recomputeWeekly(hotelKey: string) {
    const rows = await this.prisma.guestReview.findMany({
      where: { hotelKey },
      include: { analysis: true, mentions: { include: { topic: true } } },
    });
    const buckets = new Map<string, typeof rows>();
    for (const r of rows) {
      const { year, week, weekStart } = isoWeekParts(r.reviewedAt);
      const key = `${year}-W${week}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
      (r as { _weekStart?: Date })._weekStart = weekStart;
      (r as { _year?: number })._year = year;
      (r as { _week?: number })._week = week;
    }
    for (const [, list] of buckets) {
      const first = list[0]!;
      const year = (first as { _year?: number })._year!;
      const week = (first as { _week?: number })._week!;
      const weekStart = (first as { _weekStart?: Date })._weekStart!;
      const reviewCount = list.length;
      const averageScore = list.reduce((s, r) => s + r.score, 0) / reviewCount;
      const pct = this.sentimentPct(list);
      await this.prisma.weeklyReviewMetric.upsert({
        where: { hotelKey_year_week: { hotelKey, year, week } },
        create: {
          hotelKey,
          year,
          week,
          weekStart,
          reviewCount,
          averageScore,
          positivePct: pct.positivePct,
          negativePct: pct.negativePct,
          topPositiveThemes: this.topThemes(list, ReviewMentionPolarity.POSITIVE),
          topNegativeThemes: this.topThemes(list, ReviewMentionPolarity.NEGATIVE),
        },
        update: {
          weekStart,
          reviewCount,
          averageScore,
          positivePct: pct.positivePct,
          negativePct: pct.negativePct,
          topPositiveThemes: this.topThemes(list, ReviewMentionPolarity.POSITIVE),
          topNegativeThemes: this.topThemes(list, ReviewMentionPolarity.NEGATIVE),
        },
      });
    }
  }

  async recomputeMonthly(hotelKey: string) {
    const rows = await this.prisma.guestReview.findMany({
      where: { hotelKey },
      include: {
        analysis: true,
        mentions: { include: { topic: true } },
        categoryScores: true,
      },
    });
    const buckets = new Map<string, typeof rows>();
    for (const r of rows) {
      const y = r.reviewedAt.getUTCFullYear();
      const m = r.reviewedAt.getUTCMonth() + 1;
      const key = `${y}-${m}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }
    for (const [key, list] of buckets) {
      const [ys, ms] = key.split('-');
      const year = Number(ys);
      const month = Number(ms);
      const reviewCount = list.length;
      const averageScore = list.reduce((s, r) => s + r.score, 0) / reviewCount;
      const pct = this.sentimentPct(list);
      const catMap = new Map<string, number[]>();
      for (const r of list) {
        for (const c of r.categoryScores) {
          if (!catMap.has(c.category)) catMap.set(c.category, []);
          catMap.get(c.category)!.push(c.score);
        }
      }
      const categoryScores = Object.fromEntries(
        [...catMap.entries()].map(([k, vals]) => [
          k,
          vals.reduce((a, b) => a + b, 0) / vals.length,
        ]),
      );
      await this.prisma.monthlyReviewMetric.upsert({
        where: { hotelKey_year_month: { hotelKey, year, month } },
        create: {
          hotelKey,
          year,
          month,
          reviewCount,
          averageScore,
          positivePct: pct.positivePct,
          negativePct: pct.negativePct,
          topStrengths: this.topThemes(list, ReviewMentionPolarity.POSITIVE),
          topProblems: this.topThemes(list, ReviewMentionPolarity.NEGATIVE),
          categoryScores,
        },
        update: {
          reviewCount,
          averageScore,
          positivePct: pct.positivePct,
          negativePct: pct.negativePct,
          topStrengths: this.topThemes(list, ReviewMentionPolarity.POSITIVE),
          topProblems: this.topThemes(list, ReviewMentionPolarity.NEGATIVE),
          categoryScores,
        },
      });
    }
  }

  async refreshClusters(hotelKey: string) {
    const clusters = await this.prisma.reviewProblemCluster.findMany({
      include: {
        mentions: {
          include: { review: true },
        },
      },
    });
    const now = Date.now();
    const monthMs = 30 * 86400000;
    for (const c of clusters) {
      const hotelMentions = c.mentions.filter((m) => m.review.hotelKey === hotelKey);
      const mentionCount = hotelMentions.length;
      const neg = hotelMentions.filter((m) => m.polarity === ReviewMentionPolarity.NEGATIVE).length;
      const negativePct = mentionCount ? (neg / mentionCount) * 100 : 0;
      const recent = hotelMentions.filter((m) => now - m.review.reviewedAt.getTime() < monthMs).length;
      const prev = hotelMentions.filter((m) => {
        const age = now - m.review.reviewedAt.getTime();
        return age >= monthMs && age < 2 * monthMs;
      }).length;
      const trendPct = prev === 0 ? (recent > 0 ? 100 : 0) : ((recent - prev) / prev) * 100;

      let rootCauseHypothesis = c.rootCauseHypothesis;
      let suggestedAction = c.suggestedAction;
      if (mentionCount >= 5 && (!rootCauseHypothesis || !suggestedAction)) {
        const sample = hotelMentions
          .slice(0, 8)
          .map((m) => m.evidence || m.review.fullText.slice(0, 120))
          .join(' | ');
        const insight = await this.llmHypothesis(c.title, sample);
        rootCauseHypothesis = insight.hypothesis;
        suggestedAction = insight.action;
      }

      await this.prisma.reviewProblemCluster.update({
        where: { id: c.id },
        data: {
          mentionCount,
          negativePct,
          trendPct,
          rootCauseHypothesis,
          suggestedAction,
          priority:
            negativePct > 85 && mentionCount >= 10
              ? ReviewPriority.HIGH
              : c.priority,
        },
      });
    }
  }

  private async llmHypothesis(title: string, evidence: string) {
    const cfg = await this.appSettings.getAiConfigSecrets();
    if (!cfg?.openaiApiKey) {
      return {
        hypothesis: `Hypothesis: recurring complaints about ${title} may indicate an operational issue.`,
        action: `Recommendation: review ${title}-related operations and verify guest feedback samples.`,
      };
    }
    try {
      const client = new OpenAI({ apiKey: cfg.openaiApiKey });
      const res = await client.chat.completions.create({
        model: cfg.openaiModel || 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Return JSON {hypothesis, action}. Mark clearly as hypothesis/recommendation, not facts. English only.',
          },
          {
            role: 'user',
            content: `Problem title: ${title}\nEvidence samples: ${evidence}`,
          },
        ],
      });
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as {
        hypothesis?: string;
        action?: string;
      };
      return {
        hypothesis: parsed.hypothesis?.startsWith('Hypothesis')
          ? parsed.hypothesis
          : `Hypothesis: ${parsed.hypothesis ?? 'Insufficient data.'}`,
        action: parsed.action?.startsWith('Recommendation')
          ? parsed.action
          : `Recommendation: ${parsed.action ?? 'Investigate further.'}`,
      };
    } catch {
      return {
        hypothesis: `Hypothesis: recurring complaints about ${title} may indicate an operational issue.`,
        action: `Recommendation: inspect ${title} and verify against linked reviews.`,
      };
    }
  }

  async detectAnomaliesAndAlerts(hotelKey: string) {
    const settings = await this.settingsSvc.get();
    if (!settings.alertEnabled) return;

    const dailies = await this.prisma.dailyReviewMetric.findMany({
      where: { hotelKey },
      orderBy: { date: 'desc' },
      take: 30,
    });
    if (dailies.length < 8) return;
    const today = dailies[0]!;
    const baseline = dailies.slice(1, 15);
    const avgScore = baseline.reduce((s, d) => s + d.averageScore, 0) / baseline.length;
    const avgNeg = baseline.reduce((s, d) => s + d.negativePct, 0) / baseline.length;
    const scoreStd = Math.sqrt(
      baseline.reduce((s, d) => s + (d.averageScore - avgScore) ** 2, 0) / baseline.length,
    );

    if (today.averageScore < avgScore - Math.max(settings.scoreDropThreshold, scoreStd)) {
      await this.createAlertOnce(
        hotelKey,
        ReviewAlertType.SCORE_DROP,
        ReviewPriority.HIGH,
        'Daily score drop',
        `Average score fell to ${today.averageScore.toFixed(2)} (baseline ${avgScore.toFixed(2)}).`,
        { date: today.date, today: today.averageScore, baseline: avgScore },
      );
    }
    if (today.negativePct > avgNeg * settings.topicSpikeMultiplier && today.reviewCount >= 3) {
      await this.createAlertOnce(
        hotelKey,
        ReviewAlertType.ANOMALY,
        ReviewPriority.HIGH,
        'Unusual negative review share',
        `Negative share ${today.negativePct.toFixed(1)}% vs baseline ${avgNeg.toFixed(1)}%.`,
        { date: today.date },
      );
    }

    const clusters = await this.prisma.reviewProblemCluster.findMany({
      where: { mentionCount: { gte: 5 } },
      orderBy: { trendPct: 'desc' },
      take: 10,
    });
    for (const c of clusters) {
      if (c.trendPct != null && c.trendPct >= 30) {
        await this.createAlertOnce(
          hotelKey,
          ReviewAlertType.NEGATIVE_TREND,
          c.priority,
          `${c.title} trending up`,
          `Negative mentions regarding ${c.title} increased by ${c.trendPct.toFixed(0)}% vs previous month.`,
          { clusterId: c.id, trendPct: c.trendPct },
        );
      }
    }

    const critical = await this.prisma.reviewMention.findMany({
      where: {
        priority: ReviewPriority.CRITICAL,
        createdAt: { gte: new Date(Date.now() - 2 * 86400000) },
      },
      include: { review: true, topic: true },
      take: 20,
    });
    for (const m of critical) {
      if (m.review.hotelKey !== hotelKey) continue;
      await this.createAlertOnce(
        hotelKey,
        ReviewAlertType.CRITICAL_REVIEW,
        ReviewPriority.CRITICAL,
        `Critical: ${m.topic.name}`,
        m.evidence || m.review.fullText.slice(0, 240),
        { reviewId: m.reviewId, mentionId: m.id },
      );
    }
  }

  private async createAlertOnce(
    hotelKey: string,
    type: ReviewAlertType,
    severity: ReviewPriority,
    title: string,
    message: string,
    payload: object,
  ) {
    const since = new Date(Date.now() - 20 * 3600_000);
    const exists = await this.prisma.reviewAlert.findFirst({
      where: { hotelKey, type, title, createdAt: { gte: since } },
    });
    if (exists) return;
    await this.prisma.reviewAlert.create({
      data: { hotelKey, type, severity, title, message, payload },
    });
  }

  async ensureReports(hotelKey: string) {
    const today = startOfUtcDay(new Date());
    const dayKey = today.toISOString().slice(0, 10);
    const dayRows = await this.prisma.dailyReviewMetric.findUnique({
      where: { hotelKey_date: { hotelKey, date: today } },
    });
    if (dayRows) {
      const summary = await this.buildSummaryEn('daily', dayRows);
      await this.prisma.reviewManagementReport.upsert({
        where: {
          hotelKey_periodType_periodKey: { hotelKey, periodType: 'daily', periodKey: dayKey },
        },
        create: {
          hotelKey,
          periodType: 'daily',
          periodKey: dayKey,
          title: `Daily Guest Experience Summary — ${dayKey}`,
          summaryEn: summary,
          payload: dayRows,
        },
        update: { summaryEn: summary, payload: dayRows },
      });
    }

    const { year, week } = isoWeekParts(new Date());
    const weekRow = await this.prisma.weeklyReviewMetric.findUnique({
      where: { hotelKey_year_week: { hotelKey, year, week } },
    });
    if (weekRow) {
      const periodKey = `${year}-W${String(week).padStart(2, '0')}`;
      const summary = await this.buildSummaryEn('weekly', weekRow);
      await this.prisma.reviewManagementReport.upsert({
        where: {
          hotelKey_periodType_periodKey: { hotelKey, periodType: 'weekly', periodKey },
        },
        create: {
          hotelKey,
          periodType: 'weekly',
          periodKey,
          title: `Weekly Guest Experience Report — ${periodKey}`,
          summaryEn: summary,
          payload: weekRow,
        },
        update: { summaryEn: summary, payload: weekRow },
      });
    }

    const y = today.getUTCFullYear();
    const m = today.getUTCMonth() + 1;
    const monthRow = await this.prisma.monthlyReviewMetric.findUnique({
      where: { hotelKey_year_month: { hotelKey, year: y, month: m } },
    });
    if (monthRow) {
      const periodKey = `${y}-${String(m).padStart(2, '0')}`;
      const prev = await this.prisma.monthlyReviewMetric.findUnique({
        where: {
          hotelKey_year_month: {
            hotelKey,
            year: m === 1 ? y - 1 : y,
            month: m === 1 ? 12 : m - 1,
          },
        },
      });
      const yearAgo = await this.prisma.monthlyReviewMetric.findUnique({
        where: { hotelKey_year_month: { hotelKey, year: y - 1, month: m } },
      });
      const summary = await this.buildSummaryEn('monthly', { monthRow, prev, yearAgo });
      await this.prisma.reviewManagementReport.upsert({
        where: {
          hotelKey_periodType_periodKey: { hotelKey, periodType: 'monthly', periodKey },
        },
        create: {
          hotelKey,
          periodType: 'monthly',
          periodKey,
          title: `Monthly Guest Experience Report — ${periodKey}`,
          summaryEn: summary,
          payload: { monthRow, prev, yearAgo },
        },
        update: { summaryEn: summary, payload: { monthRow, prev, yearAgo } },
      });
    }
  }

  private async buildSummaryEn(kind: string, payload: unknown): Promise<string> {
    const cfg = await this.appSettings.getAiConfigSecrets();
    const fallback =
      kind === 'daily'
        ? 'Daily guest experience summary generated from stored metrics.'
        : kind === 'weekly'
          ? 'Weekly guest experience report generated from stored metrics.'
          : 'Monthly guest experience report generated from stored metrics.';
    if (!cfg?.openaiApiKey) return fallback;
    try {
      const client = new OpenAI({ apiKey: cfg.openaiApiKey });
      const res = await client.chat.completions.create({
        model: cfg.openaiModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Write a concise English management summary for hotel leadership. Cite only provided metrics. No invented facts.',
          },
          { role: 'user', content: JSON.stringify({ kind, payload }) },
        ],
      });
      return res.choices[0]?.message?.content?.trim() || fallback;
    } catch (e) {
      this.logger.warn(`Report summary AI failed: ${(e as Error).message}`);
      return fallback;
    }
  }

  async overview(hotelKey: string) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [all, last24, last7, month, latestImport, openAlerts] = await Promise.all([
      this.prisma.guestReview.findMany({
        where: { hotelKey },
        include: { analysis: true },
      }),
      this.prisma.guestReview.count({ where: { hotelKey, reviewedAt: { gte: dayAgo } } }),
      this.prisma.guestReview.count({ where: { hotelKey, reviewedAt: { gte: weekAgo } } }),
      this.prisma.guestReview.count({ where: { hotelKey, reviewedAt: { gte: monthStart } } }),
      this.prisma.reviewImportJob.findFirst({ orderBy: { createdAt: 'desc' } }),
      this.prisma.reviewAlert.count({ where: { hotelKey, acknowledgedAt: null } }),
    ]);

    const n = all.length || 1;
    const averageScore = all.length ? all.reduce((s, r) => s + r.score, 0) / all.length : 0;
    const withA = all.filter((r) => r.analysis);
    const an = withA.length || 1;
    const pct = (s: ReviewSentiment) =>
      (withA.filter((r) => r.analysis!.sentiment === s).length / an) * 100;

    const problems = await this.prisma.reviewProblemCluster.findMany({
      orderBy: { mentionCount: 'desc' },
      take: 5,
    });
    const strengths = await this.prisma.reviewMention.groupBy({
      by: ['topicId'],
      where: { polarity: ReviewMentionPolarity.POSITIVE },
      _count: { topicId: true },
      orderBy: { _count: { topicId: 'desc' } },
      take: 5,
    });
    const topicIds = strengths.map((s) => s.topicId);
    const topics = await this.prisma.reviewTopic.findMany({ where: { id: { in: topicIds } } });
    const topicName = new Map(topics.map((t) => [t.id, t.name]));

    const scoreTrend = await this.prisma.dailyReviewMetric.findMany({
      where: { hotelKey },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return {
      averageScore,
      reviewCount: all.length,
      positivePct: pct(ReviewSentiment.POSITIVE),
      negativePct: pct(ReviewSentiment.NEGATIVE),
      mixedPct: pct(ReviewSentiment.MIXED),
      neutralPct: pct(ReviewSentiment.NEUTRAL),
      reviewsLast24h: last24,
      reviewsLast7d: last7,
      reviewsThisMonth: month,
      criticalOpen: openAlerts,
      latestImport,
      topProblems: problems,
      topStrengths: strengths.map((s) => ({
        topicId: s.topicId,
        name: topicName.get(s.topicId) ?? s.topicId,
        mentions: s._count.topicId,
      })),
      scoreTrend: scoreTrend.reverse(),
    };
  }
}
