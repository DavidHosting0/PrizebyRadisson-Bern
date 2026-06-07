import { Injectable } from '@nestjs/common';
import type {
  MonitorMapAircraft,
  MonitorMapNewsAnalysis,
  MonitorMapNewsMarker,
  MonitorMapPoliceMarker,
  MonitorMapSnapshot,
  MonitorMapSyncLayerStatus,
} from '@housekeeping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AviationService } from './aviation.service';
import { NewsIngestService } from './news-ingest.service';
import { PoliceIngestService } from './police-ingest.service';

const HOTEL = {
  name: 'Prize by Radisson Bern City',
  latitude: 46.9488,
  longitude: 7.4401,
};

@Injectable()
export class MonitorMapService {
  private aviationError: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly newsIngest: NewsIngestService,
    private readonly policeIngest: PoliceIngestService,
    private readonly aviation: AviationService,
  ) {}

  async getSnapshot(): Promise<MonitorMapSnapshot> {
    const [newsRows, policeRows] = await Promise.all([
      this.prisma.monitorMapNewsItem.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 80,
      }),
      this.prisma.monitorMapPoliceItem.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 80,
      }),
    ]);

    const { fetchedAt, aircraft } = this.aviation.getCached();

    return {
      fetchedAt: new Date().toISOString(),
      news: newsRows.map((r) => this.mapNews(r)),
      police: policeRows.map((r) => this.mapPolice(r)),
      aviation: aircraft,
      aviationFetchedAt: fetchedAt?.toISOString() ?? null,
      syncStatus: {
        news: this.toSyncStatus(this.newsIngest.getStatus()),
        police: this.toSyncStatus(this.policeIngest.getStatus()),
        aviation: {
          lastSyncAt: fetchedAt?.toISOString() ?? null,
          lastError: this.aviationError,
          itemCount: aircraft.length,
        },
      },
      hotel: HOTEL,
    };
  }

  async syncFeeds(): Promise<{ news: number; police: number }> {
    const [news, police] = await Promise.all([
      this.newsIngest.syncAll(),
      this.policeIngest.syncAll(),
    ]);
    return { news, police };
  }

  async refreshAviation(): Promise<MonitorMapAircraft[]> {
    try {
      this.aviationError = null;
      return await this.aviation.refresh();
    } catch (e) {
      this.aviationError = (e as Error).message;
      throw e;
    }
  }

  listFeedSources() {
    return this.prisma.monitorMapFeedSource.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  }

  createFeedSource(data: { kind: 'NEWS' | 'POLICE'; name: string; feedUrl: string; enabled?: boolean }) {
    return this.prisma.monitorMapFeedSource.create({ data });
  }

  updateFeedSource(
    id: string,
    data: { name?: string; feedUrl?: string; enabled?: boolean },
  ) {
    return this.prisma.monitorMapFeedSource.update({ where: { id }, data });
  }

  deleteFeedSource(id: string) {
    return this.prisma.monitorMapFeedSource.delete({ where: { id } });
  }

  async getAdminStatus() {
    const [sources, newsCount, policeCount] = await Promise.all([
      this.listFeedSources(),
      this.prisma.monitorMapNewsItem.count(),
      this.prisma.monitorMapPoliceItem.count(),
    ]);
    const aviation = this.aviation.getCached();
    return {
      sources,
      counts: { news: newsCount, police: policeCount, aviation: aviation.aircraft.length },
      syncStatus: {
        news: this.toSyncStatus(this.newsIngest.getStatus()),
        police: this.toSyncStatus(this.policeIngest.getStatus()),
        aviation: {
          lastSyncAt: aviation.fetchedAt?.toISOString() ?? null,
          lastError: this.aviationError,
          itemCount: aviation.aircraft.length,
        },
      },
    };
  }

  private mapNews(row: {
    id: string;
    sourceId: string;
    title: string;
    summary: string | null;
    url: string;
    publishedAt: Date;
    latitude: number | null;
    longitude: number | null;
    locationLabel: string | null;
    aiAnalysis: unknown;
    geocodeStatus: string | null;
  }): MonitorMapNewsMarker {
    return {
      id: row.id,
      sourceId: row.sourceId,
      title: row.title,
      summary: row.summary,
      url: row.url,
      publishedAt: row.publishedAt.toISOString(),
      latitude: row.latitude,
      longitude: row.longitude,
      locationLabel: row.locationLabel,
      aiAnalysis: (row.aiAnalysis as MonitorMapNewsAnalysis | null) ?? null,
      geocodeStatus: row.geocodeStatus,
    };
  }

  private mapPolice(row: {
    id: string;
    sourceId: string;
    title: string;
    summary: string | null;
    url: string;
    publishedAt: Date;
    latitude: number | null;
    longitude: number | null;
    locationLabel: string | null;
    geocodeStatus: string | null;
  }): MonitorMapPoliceMarker {
    return {
      id: row.id,
      sourceId: row.sourceId,
      title: row.title,
      summary: row.summary,
      url: row.url,
      publishedAt: row.publishedAt.toISOString(),
      latitude: row.latitude,
      longitude: row.longitude,
      locationLabel: row.locationLabel,
      geocodeStatus: row.geocodeStatus,
    };
  }

  private toSyncStatus(s: {
    lastSyncAt: Date | null;
    lastError: string | null;
    itemCount: number;
  }): MonitorMapSyncLayerStatus {
    return {
      lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
      lastError: s.lastError,
      itemCount: s.itemCount,
    };
  }
}
