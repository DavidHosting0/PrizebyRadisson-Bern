'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { MonitorMapNewsMarker, MonitorMapPoliceMarker } from '@housekeeping/shared';
import { useMonitorMapSnapshot } from '@/lib/hooks/useMonitorMapSnapshot';
import { LayerControls } from './LayerControls';

const BernMap = dynamic(() => import('./BernMap').then((m) => m.BernMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface-muted">
      <p className="text-sm text-ink-muted">Karte wird geladen…</p>
    </div>
  ),
});

function formatTime(iso: string | null) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
}

export function MonitorMapView() {
  const { data, isLoading, error, dataUpdatedAt } = useMonitorMapSnapshot();
  const [layers, setLayers] = useState({ news: true, police: true, aviation: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sidebarItems = useMemo(() => {
    if (!data) return [];
    const items: Array<
      | { type: 'news'; item: MonitorMapNewsMarker }
      | { type: 'police'; item: MonitorMapPoliceMarker }
      | { type: 'aviation'; item: (typeof data.aviation)[0] }
    > = [];
    if (layers.news) data.news.forEach((item) => items.push({ type: 'news', item }));
    if (layers.police) data.police.forEach((item) => items.push({ type: 'police', item }));
    if (layers.aviation) data.aviation.forEach((item) => items.push({ type: 'aviation', item }));
    items.sort((a, b) => {
      const ta =
        a.type === 'aviation' ? 0 : new Date(a.item.publishedAt).getTime();
      const tb =
        b.type === 'aviation' ? 0 : new Date(b.item.publishedAt).getTime();
      return tb - ta;
    });
    return items.slice(0, 40);
  }, [data, layers]);

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading && !data) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] items-center justify-center">
        <p className="text-sm text-ink-muted">Monitor Map wird geladen…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">
          Monitor Map konnte nicht geladen werden.{error instanceof Error ? ` ${error.message}` : ''}
        </p>
      </div>
    );
  }

  const counts = {
    news: data.news.filter((n) => n.latitude != null).length,
    police: data.police.filter((p) => p.latitude != null).length,
    aviation: data.aviation.length,
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <div className="shrink-0 space-y-3 border-b border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-ink">Monitor Map · Bern</h1>
            <p className="text-xs text-ink-muted">
              Live: Nachrichten, Polizei, Luftfahrt · Aktualisiert{' '}
              {dataUpdatedAt ? formatTime(new Date(dataUpdatedAt).toISOString()) : '–'}
            </p>
          </div>
          <LayerControls layers={layers} onToggle={toggleLayer} counts={counts} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-[280px] flex-1 lg:min-h-0">
          <BernMap
            snapshot={data}
            layers={layers}
            onSelectItem={(sel) => setSelectedId(sel.id)}
          />
        </div>
        <aside className="flex max-h-64 w-full shrink-0 flex-col border-t border-border bg-surface lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Ereignisse</p>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {sidebarItems.length === 0 && (
              <li className="px-3 py-4 text-sm text-ink-muted">Keine Einträge für die gewählten Layer.</li>
            )}
            {sidebarItems.map((entry) => {
              if (entry.type === 'aviation') {
                const ac = entry.item;
                const id = ac.icao24;
                return (
                  <li
                    key={id}
                    className={`border-b border-border px-3 py-2 text-sm ${selectedId === id ? 'bg-surface-muted' : ''}`}
                  >
                    <p className="font-medium">{ac.callsign ?? ac.icao24}</p>
                    <p className="text-xs text-ink-muted">
                      {ac.kind === 'helicopter' ? 'Helikopter' : 'Flugzeug'} · live
                    </p>
                  </li>
                );
              }
              const item = entry.item;
              const id = item.id;
              const hasGeo = item.latitude != null;
              return (
                <li
                  key={id}
                  className={`border-b border-border px-3 py-2 text-sm ${selectedId === id ? 'bg-surface-muted' : ''}`}
                >
                  <p className="line-clamp-2 font-medium">{item.title}</p>
                  <p className="text-xs text-ink-muted">
                    {entry.type === 'news' ? 'Nachricht' : 'Polizei'} · {formatTime(item.publishedAt)}
                    {!hasGeo && ' · ohne Kartenposition'}
                  </p>
                  {'aiAnalysis' in item && item.aiAnalysis?.summaryDe && (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{item.aiAnalysis.summaryDe}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
