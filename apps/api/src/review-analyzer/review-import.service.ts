import { Injectable, Logger } from '@nestjs/common';
import { ReviewJobStatus, ReviewSource, ReviewAlertType, ReviewPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scrapeBookingReviews } from './booking.importer';
import { ReviewAnalyzerSettingsService } from './review-analyzer-settings.service';
import { ReviewAiService } from './review-ai.service';
import { ReviewQueueService } from './review-queue.service';
import { monthsAgoUtc } from './review-utils';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class ReviewImportService {
  private readonly logger = new Logger(ReviewImportService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsSvc: ReviewAnalyzerSettingsService,
    private readonly ai: ReviewAiService,
    private readonly queue: ReviewQueueService,
    private readonly appSettings: SettingsService,
  ) {}

  async runImport(opts?: { mode?: 'historical' | 'incremental'; force?: boolean }) {
    if (this.running) {
      return { ok: false, message: 'Import already running' };
    }
    const settings = await this.settingsSvc.get();
    if (!settings.enabled && !opts?.force) {
      return { ok: false, message: 'Review Analyzer import disabled' };
    }

    const existingCount = await this.prisma.guestReview.count({
      where: { source: ReviewSource.BOOKING, hotelKey: settings.hotelKey },
    });
    const mode =
      opts?.mode ?? (existingCount === 0 ? 'historical' : 'incremental');
    const cutoff = monthsAgoUtc(settings.historicalMonths);

    const job = await this.prisma.reviewImportJob.create({
      data: {
        source: ReviewSource.BOOKING,
        status: ReviewJobStatus.RUNNING,
        mode,
        startedAt: new Date(),
      },
    });

    this.running = true;
    let importedCount = 0;
    let skippedCount = 0;

    try {
      const knownIds = new Set(
        (
          await this.prisma.guestReview.findMany({
            where: { source: ReviewSource.BOOKING },
            select: { externalId: true },
            take: 5000,
            orderBy: { reviewedAt: 'desc' },
          })
        ).map((r) => r.externalId),
      );

      const scraped = await scrapeBookingReviews({
        url: settings.bookingUrl,
        cutoffDate: cutoff,
        maxPages: settings.maxPagesPerRun,
        headless: process.env.REVIEW_ANALYZER_HEADLESS !== 'false',
        incrementalStopIds: mode === 'incremental' ? knownIds : undefined,
      });

      for (const r of scraped.reviews) {
        const existing = await this.prisma.guestReview.findUnique({
          where: {
            source_externalId: { source: ReviewSource.BOOKING, externalId: r.externalId },
          },
        });
        if (existing && existing.contentHash === r.contentHash) {
          skippedCount++;
          continue;
        }

        const review = await this.prisma.guestReview.upsert({
          where: {
            source_externalId: { source: ReviewSource.BOOKING, externalId: r.externalId },
          },
          create: {
            source: ReviewSource.BOOKING,
            externalId: r.externalId,
            hotelKey: settings.hotelKey,
            reviewedAt: r.reviewedAt,
            stayDate: r.stayDate,
            score: r.score,
            positiveText: r.positiveText,
            negativeText: r.negativeText,
            fullText: r.fullText,
            language: r.language,
            guestName: r.guestName,
            guestCountry: r.guestCountry,
            travelType: r.travelType,
            stayNights: r.stayNights,
            roomCategory: r.roomCategory,
            contentHash: r.contentHash,
            rawPayload: r.rawPayload as object,
            categoryScores: {
              create: r.categoryScores.map((c) => ({
                category: c.category,
                score: c.score,
              })),
            },
          },
          update: {
            reviewedAt: r.reviewedAt,
            stayDate: r.stayDate,
            score: r.score,
            positiveText: r.positiveText,
            negativeText: r.negativeText,
            fullText: r.fullText,
            language: r.language,
            guestName: r.guestName,
            guestCountry: r.guestCountry,
            travelType: r.travelType,
            stayNights: r.stayNights,
            roomCategory: r.roomCategory,
            contentHash: r.contentHash,
            rawPayload: r.rawPayload as object,
          },
        });

        if (existing) {
          await this.prisma.guestReviewCategoryScore.deleteMany({ where: { reviewId: review.id } });
          if (r.categoryScores.length) {
            await this.prisma.guestReviewCategoryScore.createMany({
              data: r.categoryScores.map((c) => ({
                reviewId: review.id,
                category: c.category,
                score: c.score,
              })),
            });
          }
        }

        importedCount++;
        await this.queue.enqueueAnalyze(review.id);
      }

      const status =
        importedCount === 0 && skippedCount === 0
          ? ReviewJobStatus.EMPTY
          : ReviewJobStatus.SUCCESS;

      await this.prisma.reviewImportJob.update({
        where: { id: job.id },
        data: {
          status,
          finishedAt: new Date(),
          importedCount,
          skippedCount,
          errorMessage:
            scraped.stoppedReason === 'completed'
              ? null
              : `stopped: ${scraped.stoppedReason}; pages=${scraped.pagesFetched}`,
        },
      });

      this.logger.log(
        `Import ${mode}: imported=${importedCount} skipped=${skippedCount} status=${status}`,
      );
      return { ok: true, jobId: job.id, importedCount, skippedCount, status, mode };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(`Import failed: ${message}`);
      await this.prisma.reviewImportJob.update({
        where: { id: job.id },
        data: {
          status: ReviewJobStatus.FAILED,
          finishedAt: new Date(),
          importedCount,
          skippedCount,
          errorMessage: message,
          retryCount: { increment: 1 },
        },
      });
      if (settings.alertEnabled) {
        await this.prisma.reviewAlert.create({
          data: {
            hotelKey: settings.hotelKey,
            type: ReviewAlertType.IMPORT_FAILED,
            severity: ReviewPriority.HIGH,
            title: 'Review import failed',
            message,
            payload: { jobId: job.id },
          },
        });
      }
      // retry once after delay via queue
      await this.queue.enqueueImportRetry(job.id);
      return { ok: false, message, jobId: job.id };
    } finally {
      this.running = false;
    }
  }

  async analyzeOne(reviewId: string) {
    const review = await this.prisma.guestReview.findUnique({ where: { id: reviewId } });
    if (!review) return;
    const job = await this.prisma.reviewAnalysisJob.create({
      data: { reviewId, status: ReviewJobStatus.RUNNING, startedAt: new Date() },
    });
    try {
      const result = await this.ai.analyzeReview(review);
      const cfg = await this.appSettings.getAiConfigSecrets();
      await this.ai.persistAnalysis(reviewId, result, cfg?.openaiModel ?? 'gpt-4o-mini');
      await this.prisma.reviewAnalysisJob.update({
        where: { id: job.id },
        data: { status: ReviewJobStatus.SUCCESS, finishedAt: new Date() },
      });
    } catch (err) {
      await this.prisma.reviewAnalysisJob.update({
        where: { id: job.id },
        data: {
          status: ReviewJobStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: (err as Error).message,
          retryCount: { increment: 1 },
        },
      });
      throw err;
    }
  }

  async analyzePending(limit = 50) {
    const pending = await this.prisma.guestReview.findMany({
      where: { analysis: null },
      orderBy: { reviewedAt: 'desc' },
      take: limit,
      select: { id: true },
    });
    for (const r of pending) {
      await this.queue.enqueueAnalyze(r.id);
    }
    return { queued: pending.length };
  }
}
