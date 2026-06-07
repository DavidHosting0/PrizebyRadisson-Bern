import { Injectable, Logger } from '@nestjs/common';
import type { MonitorMapAircraft, MonitorMapAircraftKind } from '@housekeeping/shared';

type OpenSkyState = (
  | string
  | number
  | boolean
  | null
)[];

const BERN_BBOX = {
  lamin: 46.85,
  lomin: 7.3,
  lamax: 47.05,
  lomax: 7.65,
};

@Injectable()
export class AviationService {
  private readonly log = new Logger(AviationService.name);
  private cache: { fetchedAt: Date; aircraft: MonitorMapAircraft[] } | null = null;

  getCached(): { fetchedAt: Date | null; aircraft: MonitorMapAircraft[] } {
    if (!this.cache) return { fetchedAt: null, aircraft: [] };
    return { fetchedAt: this.cache.fetchedAt, aircraft: this.cache.aircraft };
  }

  async refresh(): Promise<MonitorMapAircraft[]> {
    const url = new URL('https://opensky-network.org/api/states/all');
    url.searchParams.set('lamin', String(BERN_BBOX.lamin));
    url.searchParams.set('lomin', String(BERN_BBOX.lomin));
    url.searchParams.set('lamax', String(BERN_BBOX.lamax));
    url.searchParams.set('lomax', String(BERN_BBOX.lomax));

    const res = await fetch(url, {
      headers: { 'User-Agent': 'HousekeepingMonitorMap/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`OpenSky HTTP ${res.status}`);
    }

    const body = (await res.json()) as { states: OpenSkyState[] | null };
    const aircraft = (body.states ?? [])
      .map((s) => this.mapState(s))
      .filter((a): a is MonitorMapAircraft => a !== null);

    this.cache = { fetchedAt: new Date(), aircraft };
    return aircraft;
  }

  private mapState(state: OpenSkyState): MonitorMapAircraft | null {
    const lat = state[6];
    const lon = state[5];
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;

    const callsignRaw = state[1];
    const callsign =
      typeof callsignRaw === 'string' && callsignRaw.trim().length > 0
        ? callsignRaw.trim()
        : null;
    const baroAltitude = typeof state[7] === 'number' ? state[7] : null;
    const onGround = state[8] === true;
    const velocity = typeof state[9] === 'number' ? state[9] : null;
    const trueTrack = typeof state[10] === 'number' ? state[10] : null;
    const originCountry = typeof state[2] === 'string' ? state[2] : null;

    return {
      icao24: String(state[0]),
      callsign,
      originCountry,
      latitude: lat,
      longitude: lon,
      baroAltitude,
      velocity,
      trueTrack,
      onGround,
      kind: this.classifyAircraft(callsign, baroAltitude, velocity, onGround),
    };
  }

  private classifyAircraft(
    callsign: string | null,
    baroAltitude: number | null,
    velocity: number | null,
    onGround: boolean,
  ): MonitorMapAircraftKind {
    if (onGround) return 'aircraft';
    const cs = (callsign ?? '').toUpperCase();
    if (
      cs.includes('HELI') ||
      cs.includes('REGA') ||
      cs.startsWith('HB-Z') ||
      cs.includes('POL') ||
      (baroAltitude !== null && baroAltitude < 800 && velocity !== null && velocity < 80)
    ) {
      return 'helicopter';
    }
    return 'aircraft';
  }

  getLastError(): string | null {
    return null;
  }
}
