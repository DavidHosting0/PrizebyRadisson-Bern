'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MonitorMapFeedKind, MonitorMapFeedSourceDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

type AdminStatus = {
  sources: MonitorMapFeedSourceDto[];
  counts: { news: number; police: number; aviation: number };
  syncStatus: {
    news: { lastSyncAt: string | null; lastError: string | null; itemCount: number };
    police: { lastSyncAt: string | null; lastError: string | null; itemCount: number };
    aviation: { lastSyncAt: string | null; lastError: string | null; itemCount: number };
  };
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-CH');
}

export default function MonitorMapAdminPage() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['monitor-map-admin'],
    queryFn: () => api<AdminStatus>('/monitor-map/admin/status'),
    refetchInterval: 15_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => api<{ ok: boolean; news: number; police: number }>('/monitor-map/admin/sync', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-map-admin'] });
    },
  });

  const [newKind, setNewKind] = useState<MonitorMapFeedKind>('NEWS');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      api('/monitor-map/admin/feeds', {
        method: 'POST',
        body: JSON.stringify({ kind: newKind, name: newName.trim(), feedUrl: newUrl.trim(), enabled: true }),
      }),
    onSuccess: () => {
      setNewName('');
      setNewUrl('');
      queryClient.invalidateQueries({ queryKey: ['monitor-map-admin'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: Partial<{ name: string; feedUrl: string; enabled: boolean }> }) =>
      api(`/monitor-map/admin/feeds/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitor-map-admin'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/monitor-map/admin/feeds/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitor-map-admin'] }),
  });

  const data = statusQuery.data;

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Monitor Map</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            RSS-Quellen für Nachrichten und Polizeimeldungen in der Region Bern. Luftfahrt kommt live von OpenSky.
            Für KI-Nachrichtenanalyse muss unter{' '}
            <Link href="/a/ai" className="font-medium text-action underline">
              AI
            </Link>{' '}
            ein OpenAI-Key hinterlegt sein.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/r/monitor-map">
            <Button type="button" variant="secondary">
              Karte öffnen
            </Button>
          </Link>
          <Button
            type="button"
            variant="action"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            {syncMutation.isPending ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
          </Button>
        </div>
      </div>

      {statusQuery.isLoading && <p className="text-sm text-ink-muted">Lade Status…</p>}
      {statusQuery.error && (
        <p className="text-sm text-red-600">Status konnte nicht geladen werden.</p>
      )}

      {data && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['Nachrichten', data.syncStatus.news, data.counts.news],
                ['Polizei', data.syncStatus.police, data.counts.police],
                ['Luftfahrt', data.syncStatus.aviation, data.counts.aviation],
              ] as const
            ).map(([label, sync, count]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4 shadow-card">
                <p className="text-sm font-semibold text-ink">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{count}</p>
                <p className="mt-1 text-xs text-ink-muted">Letzter Sync: {formatDateTime(sync.lastSyncAt)}</p>
                {sync.lastError && <p className="mt-1 text-xs text-red-600">{sync.lastError}</p>}
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h2 className="text-lg font-semibold text-ink">Feed-Quellen</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Benutzer mit Berechtigung <code className="text-xs">MONITOR_MAP_READ</code> sehen die Karte unter Reception
              oder Supervisor.
            </p>
            <ul className="mt-4 divide-y divide-border">
              {data.sources.length === 0 && (
                <li className="py-4 text-sm text-ink-muted">Noch keine Quellen — Standard-Feeds kommen aus dem Seed.</li>
              )}
              {data.sources.map((source) => (
                <FeedRow
                  key={source.id}
                  source={source}
                  onUpdate={(patch) => updateMutation.mutate({ id: source.id, data: patch })}
                  onDelete={() => deleteMutation.mutate(source.id)}
                  busy={updateMutation.isPending || deleteMutation.isPending}
                />
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h2 className="text-lg font-semibold text-ink">Neue Quelle</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm">
                <span className="text-ink-muted">Typ</span>
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as MonitorMapFeedKind)}
                >
                  <option value="NEWS">Nachrichten</option>
                  <option value="POLICE">Polizei</option>
                </select>
              </label>
              <label className="block text-sm sm:col-span-1">
                <span className="text-ink-muted">Name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z. B. SRF Bern"
                />
              </label>
              <label className="block text-sm lg:col-span-2">
                <span className="text-ink-muted">RSS-URL</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://…/rss.xml"
                />
              </label>
            </div>
            <Button
              type="button"
              className="mt-4"
              variant="action"
              disabled={!newName.trim() || !newUrl.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Quelle hinzufügen
            </Button>
          </section>
        </>
      )}
    </div>
  );
}

function FeedRow({
  source,
  onUpdate,
  onDelete,
  busy,
}: {
  source: MonitorMapFeedSourceDto;
  onUpdate: (patch: Partial<{ name: string; feedUrl: string; enabled: boolean }>) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(source.name);
  const [feedUrl, setFeedUrl] = useState(source.feedUrl);

  useEffect(() => {
    setName(source.name);
    setFeedUrl(source.feedUrl);
  }, [source.name, source.feedUrl]);

  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
            {source.kind === 'NEWS' ? 'Nachrichten' : 'Polizei'}
          </span>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={source.enabled}
              disabled={busy}
              onChange={(e) => onUpdate({ enabled: e.target.checked })}
            />
            Aktiv
          </label>
        </div>
        <input
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
        />
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => onUpdate({ name: name.trim(), feedUrl: feedUrl.trim() })}
        >
          Speichern
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onDelete}>
          Löschen
        </Button>
      </div>
    </li>
  );
}
