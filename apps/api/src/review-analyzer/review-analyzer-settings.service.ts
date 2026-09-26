import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_BOOKING_URL, DEFAULT_HOTEL_KEY } from './taxonomy';

export type ReviewAnalyzerSettingsStored = {
  enabled: boolean;
  bookingUrl: string;
  hotelKey: string;
  importCron: string;
  historicalMonths: number;
  maxPagesPerRun: number;
  scoreDropThreshold: number;
  topicSpikeMultiplier: number;
  retentionDays: number;
  alertEnabled: boolean;
};

const KEY = 'reviewAnalyzer';

export const DEFAULT_REVIEW_ANALYZER_SETTINGS: ReviewAnalyzerSettingsStored = {
  enabled: process.env.REVIEW_ANALYZER_ENABLED !== 'false',
  bookingUrl: process.env.REVIEW_ANALYZER_BOOKING_URL?.trim() || DEFAULT_BOOKING_URL,
  hotelKey: process.env.REVIEW_ANALYZER_HOTEL_KEY?.trim() || DEFAULT_HOTEL_KEY,
  importCron: process.env.REVIEW_ANALYZER_IMPORT_CRON?.trim() || '0 0 * * * *',
  historicalMonths: 24,
  maxPagesPerRun: 200,
  scoreDropThreshold: 0.5,
  topicSpikeMultiplier: 2,
  retentionDays: 0,
  alertEnabled: true,
};

@Injectable()
export class ReviewAnalyzerSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private asRecord(settings: unknown): Record<string, unknown> {
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      return settings as Record<string, unknown>;
    }
    return {};
  }

  private parse(raw: unknown): ReviewAnalyzerSettingsStored {
    const d = DEFAULT_REVIEW_ANALYZER_SETTINGS;
    if (!raw || typeof raw !== 'object') return { ...d };
    const o = raw as Record<string, unknown>;
    return {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
      bookingUrl: typeof o.bookingUrl === 'string' && o.bookingUrl.trim() ? o.bookingUrl.trim() : d.bookingUrl,
      hotelKey: typeof o.hotelKey === 'string' && o.hotelKey.trim() ? o.hotelKey.trim() : d.hotelKey,
      importCron: typeof o.importCron === 'string' && o.importCron.trim() ? o.importCron.trim() : d.importCron,
      historicalMonths:
        typeof o.historicalMonths === 'number' && o.historicalMonths > 0
          ? Math.min(120, Math.floor(o.historicalMonths))
          : d.historicalMonths,
      maxPagesPerRun:
        typeof o.maxPagesPerRun === 'number' && o.maxPagesPerRun > 0
          ? Math.min(500, Math.floor(o.maxPagesPerRun))
          : d.maxPagesPerRun,
      scoreDropThreshold:
        typeof o.scoreDropThreshold === 'number' ? o.scoreDropThreshold : d.scoreDropThreshold,
      topicSpikeMultiplier:
        typeof o.topicSpikeMultiplier === 'number' ? o.topicSpikeMultiplier : d.topicSpikeMultiplier,
      retentionDays: typeof o.retentionDays === 'number' ? Math.max(0, Math.floor(o.retentionDays)) : d.retentionDays,
      alertEnabled: typeof o.alertEnabled === 'boolean' ? o.alertEnabled : d.alertEnabled,
    };
  }

  async get(): Promise<ReviewAnalyzerSettingsStored> {
    const row = await this.prisma.hotelSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!row) return { ...DEFAULT_REVIEW_ANALYZER_SETTINGS };
    return this.parse(this.asRecord(row.settings)[KEY]);
  }

  async update(partial: Partial<ReviewAnalyzerSettingsStored>): Promise<ReviewAnalyzerSettingsStored> {
    let row = await this.prisma.hotelSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!row) {
      row = await this.prisma.hotelSettings.create({ data: { timezone: 'Europe/Zurich' } });
    }
    const prev = this.parse(this.asRecord(row.settings)[KEY]);
    const next = this.parse({ ...prev, ...partial });
    const settings = { ...this.asRecord(row.settings), [KEY]: next } as Prisma.InputJsonValue;
    await this.prisma.hotelSettings.update({
      where: { id: row.id },
      data: { settings },
    });
    return next;
  }
}
