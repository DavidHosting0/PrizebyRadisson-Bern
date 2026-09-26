import { Injectable, Logger } from '@nestjs/common';
import { ReviewJobStatus, ReviewSource, ReviewAlertType, ReviewPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scrapeBookingReviews, buildReviewSoftKey, dedupeReviewBlob } from './booking.importer';
import { ReviewAnalyzerSettingsService } from './review-analyzer-settings.service';
import { ReviewAiService } from './review-ai.service';
import { ReviewQueueService } from './review-queue.service';
import { monthsAgoUtc } from './review-utils';
import { SettingsService } from '../settings/settings.service';
import { ReviewAnalyticsService } from './review-analytics.service';

@Injectable()
export class ReviewImportService {
  private readonly logger = new Logger(ReviewImportService.name);
  private running = false;
  private queued = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsSvc: ReviewAnalyzerSettingsService,
    private readonly ai: ReviewAiService,
    private readonly queue: ReviewQueueService,
    private readonly appSettings: SettingsService,
    private readonly analytics: ReviewAnalyticsService,
  ) {}

  /**
   * Starts import in the background and returns immediately (avoids Nginx 504).
   */
  async startImport(opts?: { mode?: 'historical' | 'incremental'; force?: boolean }) {
    // Clear stale DB jobs so UI doesn't look forever-running after a crash
    await this.prisma.reviewImportJob.updateMany({
      where: {
        status: ReviewJobStatus.RUNNING,
        startedAt: { lt: new Date(Date.now() - 15 * 60_000) },
      },
      data: {
        status: ReviewJobStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: 'stale RUNNING job cleared before new import',
      },
    });

    if (this.running || this.queued) {
      const current = await this.prisma.reviewImportJob.findFirst({
        where: { status: ReviewJobStatus.RUNNING },
        orderBy: { createdAt: 'desc' },
      });
      return {
        ok: false,
        started: false,
        message: 'Import already running',
        jobId: current?.id ?? null,
        job: current,
      };
    }

    const settings = await this.settingsSvc.get();
    if (!settings.enabled && !opts?.force) {
      return { ok: false, started: false, message: 'Review Analyzer import disabled', jobId: null };
    }

    const existingCount = await this.prisma.guestReview.count({
      where: { source: ReviewSource.BOOKING, hotelKey: settings.hotelKey },
    });
    const mode = opts?.mode ?? (existingCount === 0 ? 'historical' : 'incremental');

    const job = await this.prisma.reviewImportJob.create({
      data: {
        source: ReviewSource.BOOKING,
        status: ReviewJobStatus.RUNNING,
        mode,
        startedAt: new Date(),
        errorMessage: 'queued — starting Playwright…',
      },
    });

    this.queued = true;
    setImmediate(() => {
      void this.executeImport(job.id, mode)
        .catch((err) => {
          this.logger.error(`Background import crashed: ${(err as Error).message}`);
        })
        .finally(() => {
          this.queued = false;
        });
    });

    return {
      ok: true,
      started: true,
      message: 'Import started in background — status updates below',
      jobId: job.id,
      mode,
      job,
    };
  }

  /** Cron path: create job and await scrape (no HTTP client waiting). */
  async runImport(opts?: { mode?: 'historical' | 'incremental'; force?: boolean }) {
    if (this.running || this.queued) {
      return { ok: false, message: 'Import already running' };
    }
    const settings = await this.settingsSvc.get();
    if (!settings.enabled && !opts?.force) {
      return { ok: false, message: 'Review Analyzer import disabled' };
    }
    const existingCount = await this.prisma.guestReview.count({
      where: { source: ReviewSource.BOOKING, hotelKey: settings.hotelKey },
    });
    const mode = opts?.mode ?? (existingCount === 0 ? 'historical' : 'incremental');
    const job = await this.prisma.reviewImportJob.create({
      data: {
        source: ReviewSource.BOOKING,
        status: ReviewJobStatus.RUNNING,
        mode,
        startedAt: new Date(),
        errorMessage: 'cron — starting Playwright…',
      },
    });
    await this.executeImport(job.id, mode);
    const finished = await this.prisma.reviewImportJob.findUnique({ where: { id: job.id } });
    return {
      ok: finished?.status === ReviewJobStatus.SUCCESS || finished?.status === ReviewJobStatus.EMPTY,
      jobId: job.id,
      importedCount: finished?.importedCount ?? 0,
      skippedCount: finished?.skippedCount ?? 0,
      status: finished?.status,
      mode,
    };
  }

  private async executeImport(jobId: string, mode: string) {
    if (this.running) return;
    this.running = true;
    this.queued = false;
    let importedCount = 0;
    let skippedCount = 0;
    const settings = await this.settingsSvc.get();
    const cutoff = monthsAgoUtc(settings.historicalMonths);

    try {
      await this.prisma.reviewImportJob.update({
        where: { id: jobId },
        data: { errorMessage: `scraping Booking (${mode}, last ${settings.historicalMonths} months)…` },
      });

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
        onProgress: async (p) => {
          await this.prisma.reviewImportJob.update({
            where: { id: jobId },
            data: { errorMessage: p.message },
          });
        },
      });

      await this.prisma.reviewImportJob.update({
        where: { id: jobId },
        data: {
          errorMessage: `saving ${scraped.reviews.length} reviews (stopped: ${scraped.stoppedReason})…`,
        },
      });

      const seenInBatch = new Set<string>();
      for (const r of scraped.reviews) {
        const soft = buildReviewSoftKey(r);
        if (seenInBatch.has(r.externalId) || seenInBatch.has(`soft:${soft}`)) {
          skippedCount++;
          continue;
        }
        seenInBatch.add(r.externalId);
        seenInBatch.add(`soft:${soft}`);

        const byExternal = await this.prisma.guestReview.findUnique({
          where: {
            source_externalId: { source: ReviewSource.BOOKING, externalId: r.externalId },
          },
        });

        // Near-duplicate: same guest + day + score (old unstable externalIds)
        let existing = byExternal;
        if (!existing) {
          const dayStart = new Date(r.reviewedAt);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
          const candidates = await this.prisma.guestReview.findMany({
            where: {
              source: ReviewSource.BOOKING,
              hotelKey: settings.hotelKey,
              reviewedAt: { gte: dayStart, lt: dayEnd },
              score: { gte: r.score - 0.05, lte: r.score + 0.05 },
              ...(r.guestName
                ? { guestName: { equals: r.guestName, mode: 'insensitive' } }
                : {}),
            },
            take: 10,
          });
          existing =
            candidates.find((c) => buildReviewSoftKey(c) === soft) ??
            candidates.find((c) => {
              const a = dedupeReviewBlob(c.positiveText) ?? '';
              const b = dedupeReviewBlob(r.positiveText) ?? '';
              const cNeg = dedupeReviewBlob(c.negativeText) ?? '';
              const rNeg = dedupeReviewBlob(r.negativeText) ?? '';
              return (a && a === b) || (cNeg && cNeg === rNeg) || c.fullText === r.fullText;
            }) ??
            null;
        }

        if (existing && existing.contentHash === r.contentHash) {
          skippedCount++;
          continue;
        }

        let reviewId: string;
        if (existing) {
          let nextExternalId = existing.externalId;
          if (existing.externalId !== r.externalId) {
            const taken = await this.prisma.guestReview.findUnique({
              where: {
                source_externalId: {
                  source: ReviewSource.BOOKING,
                  externalId: r.externalId,
                },
              },
            });
            if (!taken) nextExternalId = r.externalId;
          }
          const updated = await this.prisma.guestReview.update({
            where: { id: existing.id },
            data: {
              externalId: nextExternalId,
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
          reviewId = updated.id;
          await this.prisma.guestReviewCategoryScore.deleteMany({ where: { reviewId } });
          if (r.categoryScores.length) {
            await this.prisma.guestReviewCategoryScore.createMany({
              data: r.categoryScores.map((c) => ({
                reviewId,
                category: c.category,
                score: c.score,
              })),
            });
          }
        } else {
          const created = await this.prisma.guestReview.create({
            data: {
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
          });
          reviewId = created.id;
        }

        importedCount++;
        await this.queue.enqueueAnalyze(reviewId);
      }

      const status =
        importedCount === 0 && skippedCount === 0
          ? ReviewJobStatus.EMPTY
          : ReviewJobStatus.SUCCESS;

      await this.prisma.reviewImportJob.update({
        where: { id: jobId },
        data: {
          status,
          finishedAt: new Date(),
          importedCount,
          skippedCount,
          errorMessage: `done: ${scraped.stoppedReason}; pages=${scraped.pagesFetched}; scraped=${scraped.reviews.length}`,
        },
      });

      this.logger.log(
        `Import ${mode}: imported=${importedCount} skipped=${skippedCount} status=${status}`,
      );

      // Recompute metrics after successful import (best-effort)
      if (status !== ReviewJobStatus.EMPTY) {
        await this.analytics.recomputeMetrics(settings.hotelKey).catch((e) => {
          this.logger.warn(`Post-import recompute failed: ${(e as Error).message}`);
        });
      }
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(`Import failed: ${message}`);
      await this.prisma.reviewImportJob.update({
        where: { id: jobId },
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
            payload: { jobId },
          },
        });
      }
      await this.queue.enqueueImportRetry(jobId);
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
