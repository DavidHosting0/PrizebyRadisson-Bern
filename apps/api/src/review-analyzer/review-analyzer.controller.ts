import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PermissionCode,
  ReviewMentionPolarity,
  ReviewPriority,
  ReviewSentiment,
  ReviewSource,
  UserRole,
} from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReviewAnalyzerService } from './review-analyzer.service';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

class UpdateReviewAnalyzerSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() bookingUrl?: string;
  @IsOptional() @IsString() hotelKey?: string;
  @IsOptional() @IsString() importCron?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(120) historicalMonths?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(500) maxPagesPerRun?: number;
  @IsOptional() @IsNumber() scoreDropThreshold?: number;
  @IsOptional() @IsNumber() topicSpikeMultiplier?: number;
  @IsOptional() @IsNumber() @Min(0) retentionDays?: number;
  @IsOptional() @IsBoolean() alertEnabled?: boolean;
}

@Controller('review-analyzer')
@RequirePermissions(PermissionCode.REVIEW_ANALYZER_READ)
export class ReviewAnalyzerController {
  constructor(private readonly service: ReviewAnalyzerService) {}

  @Get('overview')
  overview() {
    return this.service.overview();
  }

  @Get('reviews')
  listReviews(
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string,
    @Query('sentiment') sentiment?: ReviewSentiment,
    @Query('language') language?: string,
    @Query('country') country?: string,
    @Query('travelType') travelType?: string,
    @Query('topicId') topicId?: string,
    @Query('clusterId') clusterId?: string,
    @Query('priority') priority?: ReviewPriority,
    @Query('polarity') polarity?: ReviewMentionPolarity,
    @Query('source') source?: ReviewSource,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.service.listReviews({
      q,
      from,
      to,
      minScore: minScore != null ? Number(minScore) : undefined,
      maxScore: maxScore != null ? Number(maxScore) : undefined,
      sentiment,
      language,
      country,
      travelType,
      topicId,
      clusterId,
      priority,
      polarity,
      source,
      take: take != null ? Number(take) : undefined,
      skip: skip != null ? Number(skip) : undefined,
    });
  }

  @Get('reviews/:id')
  getReview(@Param('id') id: string) {
    return this.service.getReview(id);
  }

  @Get('analytics/daily')
  daily(@Query('limit') limit?: string) {
    return this.service.daily(limit ? Number(limit) : 60);
  }

  @Get('analytics/weekly')
  weekly(@Query('limit') limit?: string) {
    return this.service.weekly(limit ? Number(limit) : 26);
  }

  @Get('analytics/monthly')
  monthly(@Query('limit') limit?: string) {
    return this.service.monthly(limit ? Number(limit) : 24);
  }

  @Get('analytics/problems')
  problems() {
    return this.service.problems();
  }

  @Get('analytics/problems/:clusterId/reviews')
  problemReviews(@Param('clusterId') clusterId: string) {
    return this.service.problemReviews(clusterId);
  }

  @Get('analytics/strengths')
  strengths() {
    return this.service.strengths();
  }

  @Get('analytics/strengths/:topicId/reviews')
  strengthReviews(@Param('topicId') topicId: string) {
    return this.service.strengthReviews(topicId);
  }

  @Get('analytics/trends')
  trends() {
    return this.service.trends();
  }

  @Get('analytics/scores')
  scores() {
    return this.service.categoryScoreTrends();
  }

  @Get('alerts')
  alerts(@Query('includeAcked') includeAcked?: string) {
    return this.service.alerts(includeAcked === 'true');
  }

  @Patch('alerts/:id/ack')
  ack(@Param('id') id: string) {
    return this.service.ackAlert(id);
  }

  @Get('reports')
  reports(@Query('periodType') periodType?: string) {
    return this.service.reports(periodType);
  }

  @Get('import-jobs')
  importJobs() {
    return this.service.importJobs();
  }

  @Post('import')
  import(@Body() body?: { mode?: 'historical' | 'incremental' }) {
    return this.service.triggerImport(body?.mode);
  }

  @Post('analyze')
  analyze(@Body() body?: { limit?: number }) {
    return this.service.triggerAnalyze(body?.limit);
  }

  @Post('recompute')
  recompute() {
    return this.service.recompute();
  }

  @Get('settings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getSettings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateSettings(@Body() dto: UpdateReviewAnalyzerSettingsDto) {
    return this.service.updateSettings(dto);
  }

  @Get('export')
  async export(
    @Query('format') format: 'csv' | 'xlsx' | 'pdf' = 'csv',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
  ) {
    const file = await this.service.export(format, from, to);
    res!.setHeader('Content-Type', file.contentType);
    res!.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res!.send(file.body);
  }
}
