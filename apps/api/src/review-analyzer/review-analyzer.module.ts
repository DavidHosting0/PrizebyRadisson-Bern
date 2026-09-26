import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { ReviewAnalyzerController } from './review-analyzer.controller';
import { ReviewAnalyzerService } from './review-analyzer.service';
import { ReviewAnalyzerSettingsService } from './review-analyzer-settings.service';
import { ReviewImportService } from './review-import.service';
import { ReviewAiService } from './review-ai.service';
import { ReviewQueueService } from './review-queue.service';
import { ReviewAnalyticsService } from './review-analytics.service';
import { ReviewExportService } from './review-export.service';
import { ReviewAnalyzerScheduler } from './review-analyzer.scheduler';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [ReviewAnalyzerController],
  providers: [
    ReviewAnalyzerService,
    ReviewAnalyzerSettingsService,
    ReviewImportService,
    ReviewAiService,
    ReviewQueueService,
    ReviewAnalyticsService,
    ReviewExportService,
    ReviewAnalyzerScheduler,
  ],
  exports: [ReviewAnalyzerService],
})
export class ReviewAnalyzerModule {}
