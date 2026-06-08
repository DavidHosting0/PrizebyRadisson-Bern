export type MonitorMapFeedKind = 'NEWS' | 'POLICE';

export type MonitorMapNewsAnalysis = {
  summaryDe: string;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  categories: string[];
  isBernRelevant: boolean;
  locationHint: string | null;
  isSafetyRelevant: boolean;
  dangerTypes: string[];
};

export type MonitorMapNewsMarker = {
  id: string;
  sourceId: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: string;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  aiAnalysis: MonitorMapNewsAnalysis | null;
  geocodeStatus: string | null;
};

export type MonitorMapPoliceMarker = {
  id: string;
  sourceId: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: string;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  geocodeStatus: string | null;
};

export type MonitorMapAircraftKind = 'aircraft' | 'helicopter';

export type MonitorMapAircraft = {
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  latitude: number;
  longitude: number;
  baroAltitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  onGround: boolean;
  kind: MonitorMapAircraftKind;
};

export type MonitorMapSyncLayerStatus = {
  lastSyncAt: string | null;
  lastError: string | null;
  itemCount: number;
};

export type MonitorMapSnapshot = {
  fetchedAt: string;
  news: MonitorMapNewsMarker[];
  police: MonitorMapPoliceMarker[];
  aviation: MonitorMapAircraft[];
  aviationFetchedAt: string | null;
  syncStatus: {
    news: MonitorMapSyncLayerStatus;
    police: MonitorMapSyncLayerStatus;
    aviation: MonitorMapSyncLayerStatus;
  };
  hotel: {
    name: string;
    latitude: number;
    longitude: number;
  };
};

export type MonitorMapFeedSourceDto = {
  id: string;
  kind: MonitorMapFeedKind;
  name: string;
  feedUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

const SAFETY_KEYWORD_RE =
  /\b(demo|demonstration|kundgebung|sperr|gesperrt|unfall|brand|polizei|gewalt|angriff|konflikt|evakuiert|festnahme|verletzt|kollision|raub|diebstahl|vandalismus|durchsuchung|einsatz)\b/i;

export function matchesMonitorMapSafetyKeywords(title: string, summary: string | null): boolean {
  return SAFETY_KEYWORD_RE.test(`${title} ${summary ?? ''}`);
}

export function isNewsSafetyRelevant(item: MonitorMapNewsMarker): boolean {
  if (item.aiAnalysis != null) return item.aiAnalysis.isSafetyRelevant;
  return matchesMonitorMapSafetyKeywords(item.title, item.summary);
}

export function isPoliceSafetyRelevant(item: MonitorMapPoliceMarker): boolean {
  return matchesMonitorMapSafetyKeywords(item.title, item.summary);
}

export const MONITOR_MAP_DANGER_TYPE_LABELS: Record<string, string> = {
  demo: 'Demo',
  sperrung: 'Sperrung',
  unfall: 'Unfall',
  brand: 'Brand',
  gewalt: 'Gewalt',
  polizei: 'Polizei',
  konflikt: 'Konflikt',
};
