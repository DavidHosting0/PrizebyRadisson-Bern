export type MonitorMapFeedKind = 'NEWS' | 'POLICE';

export type MonitorMapNewsAnalysis = {
  summaryDe: string;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  categories: string[];
  isBernRelevant: boolean;
  locationHint: string | null;
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
