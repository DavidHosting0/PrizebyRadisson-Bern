import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReviewImportService } from './review-import.service';
import { ReviewAnalyticsService } from './review-analytics.service';
import { ReviewAnalyzerSettingsService } from './review-analyzer-settings.service';
import { ReviewQueueService } from './review-queue.service';
import { ReviewAnalyzerService } from './review-analyzer.service';

@Injectable()
export class ReviewAnalyzerScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReviewAnalyzerScheduler.name);

  constructor(
    private readonly imports: ReviewImportService,
    private readonly analytics: ReviewAnalyticsService,
    private readonly settings: ReviewAnalyzerSettingsService,
    private readonly queue: ReviewQueueService,
    private readonly service: ReviewAnalyzerService,
  ) {}

  async onModuleInit() {
    await this.service.onBootstrap();
    this.queue.registerHandlers({
      analyze: (reviewId) => this.imports.analyzeOne(reviewId),
      importRetry: async () => {
        await this.imports.runImport({ force: true });
      },
    });
  }

  /** Hourly import — Nest 6-field cron (seconds first). */
  @Cron(process.env.REVIEW_ANALYZER_IMPORT_CRON ?? '0 0 * * * *')
  async hourlyImport() {
    const s = await this.settings.get();
    if (!s.enabled) return;
    this.logger.log('Review Analyzer hourly import starting');
    await this.imports.runImport();
    await this.analytics.recomputeMetrics(s.hotelKey);
  }

  /** Nightly metrics/reports refresh. */
  @Cron('0 15 3 * * *')
  async nightlyRecompute() {
    const s = await this.settings.get();
    if (!s.enabled) return;
    await this.analytics.recomputeMetrics(s.hotelKey);
  }
}
