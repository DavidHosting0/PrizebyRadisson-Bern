import { Injectable, Logger } from '@nestjs/common';

type GeocodeResult = {
  latitude: number;
  longitude: number;
  label: string;
};

@Injectable()
export class GeocodingService {
  private readonly log = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, GeocodeResult | null>();
  private lastRequestAt = 0;

  async geocodeBern(query: string): Promise<GeocodeResult | null> {
    const key = query.trim().toLowerCase();
    if (!key) return null;
    if (this.cache.has(key)) return this.cache.get(key) ?? null;

    await this.rateLimit();

    const q = `${query}, Bern, Switzerland`;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'ch');

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'HousekeepingMonitorMap/1.0 (hotel-ops; contact@demo.local)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.log.warn(`Nominatim HTTP ${res.status} for "${query}"`);
        this.cache.set(key, null);
        return null;
      }
      const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!data.length) {
        this.cache.set(key, null);
        return null;
      }
      const hit = data[0];
      const result: GeocodeResult = {
        latitude: parseFloat(hit.lat),
        longitude: parseFloat(hit.lon),
        label: hit.display_name,
      };
      this.cache.set(key, result);
      return result;
    } catch (e) {
      this.log.warn(`Nominatim error for "${query}": ${(e as Error).message}`);
      this.cache.set(key, null);
      return null;
    }
  }

  private async rateLimit() {
    const minGapMs = 1100;
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < minGapMs) {
      await new Promise((r) => setTimeout(r, minGapMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }
}
