'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  isNewsSafetyRelevant,
  isPoliceSafetyRelevant,
  MONITOR_MAP_DANGER_TYPE_LABELS,
  type MonitorMapNewsMarker,
  type MonitorMapPoliceMarker,
} from '@housekeeping/shared';
import { useMonitorMapSnapshot } from '@/lib/hooks/useMonitorMapSnapshot';
import { LayerControls } from './LayerControls';
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

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

function DangerBadges({ dangerTypes, dark }: { dangerTypes: string[]; dark?: boolean }) {
  if (dangerTypes.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {dangerTypes.map((type) => (
        <span
          key={type}
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            dark ? 'bg-rose-500/15 text-rose-200' : 'bg-red-100 text-red-800',
          )}
        >
          {MONITOR_MAP_DANGER_TYPE_LABELS[type] ?? type}
        </span>
      ))}
    </div>
  );
}

export function MonitorMapView({
  tone = 'light',
  onEnterMobile,
}: {
  tone?: 'light' | 'dark';
  onEnterMobile?: () => void;
} = {}) {
  const dark = tone === 'dark';
  const { data, isLoading, error, dataUpdatedAt } = useMonitorMapSnapshot();
  const [layers, setLayers] = useState({ news: true, police: true, aviation: true });
  const [dangerOnly, setDangerOnly] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredNews = useMemo(() => {
    if (!data) return [];
    const items = layers.news ? data.news : [];
    return dangerOnly ? items.filter(isNewsSafetyRelevant) : items;
  }, [data, layers.news, dangerOnly]);

  const filteredPolice = useMemo(() => {
    if (!data) return [];
    const items = layers.police ? data.police : [];
    return dangerOnly ? items.filter(isPoliceSafetyRelevant) : items;
  }, [data, layers.police, dangerOnly]);

  const sidebarItems = useMemo(() => {
    if (!data) return [];
    const items: Array<
      | { type: 'news'; item: MonitorMapNewsMarker }
      | { type: 'police'; item: MonitorMapPoliceMarker }
      | { type: 'aviation'; item: (typeof data.aviation)[0] }
    > = [];
    filteredNews.forEach((item) => items.push({ type: 'news', item }));
    filteredPolice.forEach((item) => items.push({ type: 'police', item }));
    if (layers.aviation) data.aviation.forEach((item) => items.push({ type: 'aviation', item }));
    items.sort((a, b) => {
      const ta = a.type === 'aviation' ? 0 : new Date(a.item.publishedAt).getTime();
      const tb = b.type === 'aviation' ? 0 : new Date(b.item.publishedAt).getTime();
      return tb - ta;
    });
    return items.slice(0, 40);
  }, [data, filteredNews, filteredPolice, layers.aviation]);

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading && !data) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] items-center justify-center">
        <p className={clsx('text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>Monitor Map wird geladen…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <p className={clsx('text-sm', dark ? 'text-red-400' : 'text-red-600')}>
          Monitor Map konnte nicht geladen werden.{error instanceof Error ? ` ${error.message}` : ''}
        </p>
      </div>
    );
  }

  const counts = {
    news: filteredNews.filter((n) => n.latitude != null).length,
    police: filteredPolice.filter((p) => p.latitude != null).length,
    aviation: data.aviation.length,
  };

  const dangerOnlyToggle = (
    <label className={clsx('inline-flex cursor-pointer items-center gap-2 text-sm', dark && 'text-sidebar-muted')}>
      <input
        type="checkbox"
        checked={dangerOnly}
        onChange={(e) => setDangerOnly(e.target.checked)}
        className={dark ? 'rounded border-sidebar-border' : 'rounded border-border'}
      />
      <span>Nur Gefahren</span>
    </label>
  );

  const mapAndSidebar = (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="min-h-[280px] flex-1 lg:min-h-0">
        <BernMap
          snapshot={data}
          layers={layers}
          filteredNews={filteredNews}
          filteredPolice={filteredPolice}
          onSelectItem={(sel) => setSelectedId(sel.id)}
        />
      </div>
      <aside
        className={clsx(
          'flex max-h-64 w-full shrink-0 flex-col lg:max-h-none lg:w-80',
          dark
            ? 'border-t border-sidebar-border/60 bg-[#1A2332] lg:border-l lg:border-t-0'
            : 'border-t border-border bg-surface lg:border-l lg:border-t-0',
        )}
      >
        <div className={clsx('border-b px-3 py-2', dark ? 'border-sidebar-border/60' : 'border-border')}>
          <p className={clsx('text-xs font-semibold uppercase tracking-wide', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
            Ereignisse
          </p>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {sidebarItems.length === 0 && (
            <li className={clsx('px-3 py-4 text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
              {dangerOnly
                ? 'Keine Gefahrenmeldungen für die gewählten Layer.'
                : 'Keine Einträge für die gewählten Layer.'}
            </li>
          )}
          {sidebarItems.map((entry) => {
            if (entry.type === 'aviation') {
              const ac = entry.item;
              const id = ac.icao24;
              const selected = selectedId === id;
              return (
                <li
                  key={id}
                  className={clsx(
                    'border-b px-3 py-2 text-sm',
                    dark
                      ? clsx('border-sidebar-border/40', selected && 'bg-white/5', 'text-white')
                      : clsx('border-border', selected && 'bg-surface-muted'),
                  )}
                >
                  <p className="font-medium">{ac.callsign ?? ac.icao24}</p>
                  <p className={clsx('text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                    {ac.kind === 'helicopter' ? 'Helikopter' : 'Flugzeug'} · live
                  </p>
                </li>
              );
            }
            const item = entry.item;
            const id = item.id;
            const hasGeo = item.latitude != null;
            const dangerTypes =
              entry.type === 'news' ? (entry.item.aiAnalysis?.dangerTypes ?? []) : [];
            const selected = selectedId === id;
            return (
              <li
                key={id}
                className={clsx(
                  'border-b px-3 py-2 text-sm',
                  dark
                    ? clsx('border-sidebar-border/40', selected && 'bg-white/5', 'text-white')
                    : clsx('border-border', selected && 'bg-surface-muted'),
                )}
              >
                <p className="line-clamp-2 font-medium">{item.title}</p>
                <p className={clsx('text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                  {entry.type === 'news' ? 'Nachricht' : 'Polizei'} · {formatTime(item.publishedAt)}
                  {!hasGeo && ' · ohne Kartenposition'}
                </p>
                {entry.type === 'news' && <DangerBadges dangerTypes={dangerTypes} dark={dark} />}
                {'aiAnalysis' in item && item.aiAnalysis?.summaryDe && (
                  <p className={clsx('mt-1 line-clamp-2 text-xs', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
                    {item.aiAnalysis.summaryDe}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );

  if (dark) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <AppPageChrome
          title="Monitor Map · Bern"
          description={`Live: Nachrichten, Polizei, Luftfahrt · Aktualisiert ${
            dataUpdatedAt ? formatTime(new Date(dataUpdatedAt).toISOString()) : '–'
          }`}
          actions={<AppChromeTools onEnterMobile={onEnterMobile} />}
          toolbar={
            <div className="flex flex-wrap items-center gap-3">
              {dangerOnlyToggle}
              <LayerControls dark layers={layers} onToggle={toggleLayer} counts={counts} />
            </div>
          }
        />
        <AppPageBody className="flex flex-col overflow-hidden">{mapAndSidebar}</AppPageBody>
      </div>
    );
  }

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
          <div className="flex flex-wrap items-center gap-3">
            {dangerOnlyToggle}
            <LayerControls layers={layers} onToggle={toggleLayer} counts={counts} />
          </div>
        </div>
      </div>

      {mapAndSidebar}
    </div>
  );
}
