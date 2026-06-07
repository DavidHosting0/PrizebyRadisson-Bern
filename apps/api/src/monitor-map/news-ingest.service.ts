import { Injectable, Logger } from '@nestjs/common';
import { MonitorMapFeedKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from './geocoding.service';
import { NewsAnalysisService } from './news-analysis.service';
import { extractLocationFromText, fetchRssItems } from './rss.util';

export type LayerSyncStatus = {
  lastSyncAt: Date | null;
  lastError: string | null;
  itemCount: number;
};

@Injectable()
export class NewsIngestService {
  private readonly log = new Logger(NewsIngestService.name);
  private status: LayerSyncStatus = { lastSyncAt: null, lastError: null, itemCount: 0 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly analysis: NewsAnalysisService,
  ) {}

  getStatus(): LayerSyncStatus {
    return { ...this.status };
  }

  async syncAll(): Promise<number> {
    const sources = await this.prisma.monitorMapFeedSource.findMany({
      where: { kind: MonitorMapFeedKind.NEWS, enabled: true },
    });
    let total = 0;
    let lastError: string | null = null;

    for (const source of sources) {
      try {
        total += await this.syncSource(source.id, source.feedUrl);
      } catch (e) {
        lastError = (e as Error).message;
        this.log.warn(`News sync ${source.name}: ${lastError}`);
      }
    }

    const itemCount = await this.prisma.monitorMapNewsItem.count();
    this.status = {
      lastSyncAt: new Date(),
      lastError,
      itemCount,
    };
    return total;
  }

  private async syncSource(sourceId: string, feedUrl: string): Promise<number> {
    const items = await fetchRssItems(feedUrl);
    let created = 0;

    for (const item of items) {
      const existing = await this.prisma.monitorMapNewsItem.findUnique({
        where: { sourceId_externalId: { sourceId, externalId: item.externalId } },
      });
      if (existing) continue;

      let aiAnalysis = await this.analysis.analyzeArticle(item.title, item.summary);
      let locationHint = aiAnalysis?.locationHint ?? extractLocationFromText(item.title, item.summary);
      let latitude: number | null = null;
      let longitude: number | null = null;
      let locationLabel: string | null = null;
      let geocodeStatus: string | null = 'skipped';

      if (locationHint) {
        const geo = await this.geocoding.geocodeBern(locationHint);
        if (geo) {
          latitude = geo.latitude;
          longitude = geo.longitude;
          locationLabel = geo.label;
          geocodeStatus = 'ok';
        } else {
          geocodeStatus = 'failed';
        }
      }

      if (!aiAnalysis && item.summary) {
        aiAnalysis = {
          summaryDe: item.summary.slice(0, 200),
          urgency: 'normal',
          categories: ['Nachricht'],
          isBernRelevant: true,
          locationHint,
        };
      }

      await this.prisma.monitorMapNewsItem.create({
        data: {
          sourceId,
          externalId: item.externalId,
          title: item.title,
          summary: item.summary,
          url: item.url,
          publishedAt: item.publishedAt,
          latitude,
          longitude,
          locationLabel,
          aiAnalysis: aiAnalysis ?? undefined,
          geocodeStatus,
        },
      });
      created += 1;
    }

    await this.pruneOldItems();
    return created;
  }

  private async pruneOldItems() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    await this.prisma.monitorMapNewsItem.deleteMany({
      where: { publishedAt: { lt: cutoff } },
    });
  }
}
