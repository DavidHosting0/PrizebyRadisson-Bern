'use client';

import type {
  MonitorMapAircraft,
  MonitorMapNewsMarker,
  MonitorMapPoliceMarker,
  MonitorMapSnapshot,
} from '@housekeeping/shared';
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BERN_CENTER: [number, number] = [46.948, 7.4474];

const HOTEL_ICON = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#1a1a1a;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

type LayerVisibility = {
  news: boolean;
  police: boolean;
  aviation: boolean;
};

type Props = {
  snapshot: MonitorMapSnapshot;
  layers: LayerVisibility;
  onSelectItem?: (item: { type: 'news' | 'police' | 'aviation'; id: string }) => void;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
}

function urgencyColor(urgency: string | undefined) {
  switch (urgency) {
    case 'critical':
      return '#dc2626';
    case 'high':
      return '#ea580c';
    case 'low':
      return '#64748b';
    default:
      return '#2563eb';
  }
}

export function BernMap({ snapshot, layers, onSelectItem }: Props) {
  const newsOnMap = layers.news
    ? snapshot.news.filter((n) => n.latitude != null && n.longitude != null)
    : [];
  const policeOnMap = layers.police
    ? snapshot.police.filter((p) => p.latitude != null && p.longitude != null)
    : [];
  const aviation = layers.aviation ? snapshot.aviation : [];

  return (
    <MapContainer center={BERN_CENTER} zoom={13} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[snapshot.hotel.latitude, snapshot.hotel.longitude]} icon={HOTEL_ICON}>
        <Tooltip permanent direction="top" offset={[0, -8]} className="!border-0 !bg-transparent !shadow-none">
          <span className="rounded bg-surface px-2 py-0.5 text-xs font-medium shadow-card">{snapshot.hotel.name}</span>
        </Tooltip>
      </Marker>
      {newsOnMap.map((item) => (
        <NewsMarker key={item.id} item={item} onSelect={onSelectItem} />
      ))}
      {policeOnMap.map((item) => (
        <PoliceMarker key={item.id} item={item} onSelect={onSelectItem} />
      ))}
      {aviation.map((ac) => (
        <AircraftMarker key={ac.icao24} aircraft={ac} onSelect={onSelectItem} />
      ))}
    </MapContainer>
  );
}

function NewsMarker({
  item,
  onSelect,
}: {
  item: MonitorMapNewsMarker;
  onSelect?: Props['onSelectItem'];
}) {
  const color = urgencyColor(item.aiAnalysis?.urgency);
  return (
    <CircleMarker
      center={[item.latitude!, item.longitude!]}
      radius={9}
      pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 }}
      eventHandlers={{ click: () => onSelect?.({ type: 'news', id: item.id }) }}
    >
      <Popup>
        <div className="max-w-xs space-y-1 text-sm">
          <p className="font-semibold">{item.title}</p>
          {item.aiAnalysis?.summaryDe && <p className="text-ink-muted">{item.aiAnalysis.summaryDe}</p>}
          {item.locationLabel && <p className="text-xs text-ink-muted">{item.locationLabel}</p>}
          <p className="text-xs text-ink-muted">{formatTime(item.publishedAt)}</p>
          <a href={item.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-action underline">
            Artikel öffnen
          </a>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function PoliceMarker({
  item,
  onSelect,
}: {
  item: MonitorMapPoliceMarker;
  onSelect?: Props['onSelectItem'];
}) {
  return (
    <CircleMarker
      center={[item.latitude!, item.longitude!]}
      radius={9}
      pathOptions={{ color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 0.9 }}
      eventHandlers={{ click: () => onSelect?.({ type: 'police', id: item.id }) }}
    >
      <Popup>
        <div className="max-w-xs space-y-1 text-sm">
          <p className="font-semibold">{item.title}</p>
          {item.summary && <p className="text-ink-muted">{item.summary.slice(0, 200)}</p>}
          {item.locationLabel && <p className="text-xs text-ink-muted">{item.locationLabel}</p>}
          <p className="text-xs text-ink-muted">{formatTime(item.publishedAt)}</p>
          <a href={item.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-action underline">
            Meldung öffnen
          </a>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function AircraftMarker({
  aircraft,
  onSelect,
}: {
  aircraft: MonitorMapAircraft;
  onSelect?: Props['onSelectItem'];
}) {
  const fill = aircraft.kind === 'helicopter' ? '#f97316' : '#64748b';
  return (
    <CircleMarker
      center={[aircraft.latitude, aircraft.longitude]}
      radius={7}
      pathOptions={{ color: '#fff', weight: 1, fillColor: fill, fillOpacity: 0.95 }}
      eventHandlers={{ click: () => onSelect?.({ type: 'aviation', id: aircraft.icao24 }) }}
    >
      <Popup>
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{aircraft.callsign ?? aircraft.icao24}</p>
          <p className="text-ink-muted">
            {aircraft.kind === 'helicopter' ? 'Helikopter' : 'Flugzeug'}
            {aircraft.originCountry ? ` · ${aircraft.originCountry}` : ''}
          </p>
          {aircraft.baroAltitude != null && (
            <p className="text-xs text-ink-muted">Höhe: {Math.round(aircraft.baroAltitude)} m</p>
          )}
          {aircraft.velocity != null && (
            <p className="text-xs text-ink-muted">Geschw.: {Math.round(aircraft.velocity)} m/s</p>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
}
