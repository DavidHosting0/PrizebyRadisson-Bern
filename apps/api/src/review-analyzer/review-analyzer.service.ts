import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
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

  async daily(limit = 60) {
    const s = await this.settingsSvc.get();
    return this.prisma.dailyReviewMetric.findMany({
      where: { hotelKey: s.hotelKey },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async weekly(limit = 26) {
    const s = await this.settingsSvc.get();
    return this.prisma.weeklyReviewMetric.findMany({
      where: { hotelKey: s.hotelKey },
      orderBy: { weekStart: 'desc' },
      take: limit,
    });
  }

  async monthly(limit = 24) {
    const s = await this.settingsSvc.get();
    return this.prisma.monthlyReviewMetric.findMany({
      where: { hotelKey: s.hotelKey },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: limit,
    });
  }

  async problems() {
    return this.prisma.reviewProblemCluster.findMany({
      orderBy: [{ mentionCount: 'desc' }],
      include: { topics: { include: { topic: true } } },
    });
  }

  async problemReviews(clusterId: string) {
    return this.listReviews({ clusterId, take: 100 });
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

  async trends() {
    const [daily, weekly, monthly] = await Promise.all([
      this.daily(90),
      this.weekly(52),
      this.monthly(36),
    ]);
    return { daily: daily.reverse(), weekly: weekly.reverse(), monthly: monthly.reverse() };
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
    return this.imports.runImport({ mode, force: true });
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
