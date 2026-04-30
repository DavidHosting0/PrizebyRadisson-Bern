'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';

type FavurConfig = {
  id: string;
  enabled: boolean;
  baseUrl: string;
  windowDays: number;
  hasApiKey: boolean;
  apiKey: string | null;
  hasActiveCapture: boolean;
  activeCaptureId: string | null;
  activeUrl: string | null;
  activeMethod: string | null;
  activeCapturedAt: string | null;
  shiftsJsonPath: string;
  fieldShiftId: string;
  fieldUserId: string;
  fieldUserName: string;
  fieldStartsAt: string;
  fieldEndsAt: string;
  fieldLabel: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncCount: number;
  syncInProgress: boolean;
};

type LocalUserRef = {
  id: string;
  name: string;
  email: string;
  role: string;
  titlePrefix: string;
  isActive: boolean;
  avatarUrl: string | null;
};

type FavurUserMap = {
  id: string;
  favurUserId: string;
  favurDisplayName: string | null;
  lastSeenAt: string;
  user: LocalUserRef | null;
};

type UserListRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  titlePrefix: string;
  isActive: boolean;
};

type CaptureSummary = {
  id: string;
  url: string;
  method: string;
  responseStatus: number;
  responseShape: string | null;
  capturedAt: string;
  capturedFrom: string | null;
  isActive: boolean;
};

type CaptureDetail = CaptureSummary & {
  responseSample: string;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-CH');
}

function shortUrl(url: string, max = 60): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}

export default function FavurIntegrationPage() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['favur-config'],
    queryFn: () => api<FavurConfig>('/favur/config'),
    refetchInterval: 10_000,
  });

  const usersQuery = useQuery({
    queryKey: ['favur-users'],
    queryFn: () => api<FavurUserMap[]>('/favur/users'),
    refetchInterval: 30_000,
  });

  const localUsersQuery = useQuery({
    queryKey: ['users-list-min'],
    queryFn: () => api<UserListRow[]>('/users'),
  });

  const capturesQuery = useQuery({
    queryKey: ['favur-captures'],
    queryFn: () => api<CaptureSummary[]>('/favur/captures'),
    refetchInterval: 10_000,
  });

  const updateMut = useMutation({
    mutationFn: (body: Partial<FavurConfig>) =>
      api<FavurConfig>('/favur/config', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favur-config'] });
    },
  });

  const apiKeyMut = useMutation({
    mutationFn: () => api<{ apiKey: string }>('/favur/api-key', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favur-config'] });
    },
  });

  const syncMut = useMutation({
    mutationFn: () => api<FavurConfig>('/favur/sync', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favur-config'] });
      queryClient.invalidateQueries({ queryKey: ['favur-users'] });
    },
  });

  const activateMut = useMutation({
    mutationFn: (id: string) =>
      api<FavurConfig>(`/favur/captures/${id}/activate`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favur-config'] });
      queryClient.invalidateQueries({ queryKey: ['favur-captures'] });
    },
  });

  const deleteCaptureMut = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/favur/captures/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favur-captures'] });
    },
  });

  const mapUserMut = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string | null }) =>
      api<FavurUserMap>(`/favur/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favur-users'] });
    },
  });

  const config = configQuery.data;

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://web.favur.ch');
  const [windowDays, setWindowDays] = useState(14);
  const [shiftsJsonPath, setShiftsJsonPath] = useState('');
  const [fieldShiftId, setFieldShiftId] = useState('id');
  const [fieldUserId, setFieldUserId] = useState('user.id');
  const [fieldUserName, setFieldUserName] = useState('user.fullName');
  const [fieldStartsAt, setFieldStartsAt] = useState('startsAt');
  const [fieldEndsAt, setFieldEndsAt] = useState('endsAt');
  const [fieldLabel, setFieldLabel] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const [shownApiKey, setShownApiKey] = useState<string | null>(null);
  const [previewCaptureId, setPreviewCaptureId] = useState<string | null>(null);

  useEffect(() => {
    if (!config || hydrated) return;
    setEnabled(config.enabled);
    setBaseUrl(config.baseUrl);
    setWindowDays(config.windowDays);
    setShiftsJsonPath(config.shiftsJsonPath);
    setFieldShiftId(config.fieldShiftId);
    setFieldUserId(config.fieldUserId);
    setFieldUserName(config.fieldUserName);
    setFieldStartsAt(config.fieldStartsAt);
    setFieldEndsAt(config.fieldEndsAt);
    setFieldLabel(config.fieldLabel ?? '');
    setHydrated(true);
  }, [config, hydrated]);

  const localUserOptions = useMemo(() => {
    const list = localUsersQuery.data ?? [];
    return list
      .filter((u) => u.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [localUsersQuery.data]);

  return (
    <div className="space-y-8 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Integrationen</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Externe Datenquellen, die in den Schichtplan einfliessen.
        </p>
      </header>

      {/* ── Setup card ── */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Favur</h2>
            <p className="text-sm text-ink-muted">
              Schichten werden alle 15 Minuten von web.favur.ch importiert. Die
              Browser-Extension fängt Favurs API-Calls inkl. Cookies ab und schickt
              sie hierher.
            </p>
          </div>
          <SyncStatusBadge config={config} />
        </div>

        {/* setup steps */}
        <ol className="mt-5 space-y-3 text-sm text-ink">
          <Step n={1} title="API-Key erzeugen">
            <p className="text-ink-muted">
              Der Schlüssel wird einmalig angezeigt — kopieren und in der Extension
              einfügen.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  apiKeyMut.mutate(undefined, {
                    onSuccess: (r) => setShownApiKey(r.apiKey),
                  });
                }}
                disabled={apiKeyMut.isPending}
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white"
              >
                {config?.hasApiKey ? 'Neu erzeugen (alten ungültig machen)' : 'API-Key erzeugen'}
              </button>
              {config?.hasApiKey && !shownApiKey && (
                <span className="text-xs text-ink-muted">Aktuell aktiv (Wert verborgen).</span>
              )}
            </div>
            {shownApiKey && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">
                  Jetzt kopieren! Wird nicht erneut angezeigt:
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 select-all break-all rounded border border-emerald-200 bg-white px-2 py-1 font-mono text-xs">
                    {shownApiKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(shownApiKey)}
                    className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white"
                  >
                    Kopieren
                  </button>
                </div>
              </div>
            )}
          </Step>

          <Step n={2} title="Extension installieren">
            <p className="text-ink-muted">
              Im Repo unter <code className="rounded bg-surface-muted px-1 py-0.5">apps/favur-extension</code>.
              Chrome/Edge öffnen → <code className="rounded bg-surface-muted px-1 py-0.5">chrome://extensions</code> →
              „Entwicklermodus" anschalten → „Entpackt laden" → diesen Ordner wählen.
              Detaillierte Anleitung: README im Extension-Ordner.
            </p>
          </Step>

          <Step n={3} title="Extension konfigurieren">
            <p className="text-ink-muted">
              Klick auf das Extension-Icon in der Browser-Toolbar. Backend-URL eintragen
              (<code className="rounded bg-surface-muted px-1 py-0.5">https://prizebern.com/api/v1</code>),
              den API-Key einfügen, Speichern, Testen.
            </p>
          </Step>

          <Step n={4} title="Bei Favur einloggen">
            <p className="text-ink-muted">
              In demselben Browser auf <code className="rounded bg-surface-muted px-1 py-0.5">web.favur.ch</code> einloggen
              (Telefon + SMS). „stay logged in" anhaken. Auf den Schichtplan navigieren — die
              Extension fängt die Calls automatisch ab und sie erscheinen unten als Captures.
            </p>
          </Step>
        </ol>

        {/* config form */}
        <form
          className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-muted p-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            updateMut.mutate({
              enabled,
              baseUrl,
              windowDays,
              shiftsJsonPath,
              fieldShiftId,
              fieldUserId,
              fieldUserName,
              fieldStartsAt,
              fieldEndsAt,
              fieldLabel: fieldLabel.trim() || null,
            });
          }}
        >
          <label className="md:col-span-2 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-ink">Sync aktiviert</span>
            <span className="ml-auto text-xs text-ink-muted">
              Cron läuft alle 15 min, Button kann manuell auslösen.
            </span>
          </label>
          <Field label="Basis-URL"><input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" /></Field>
          <Field label="Sync-Fenster (Tage)"><input type="number" min={1} max={60} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" /></Field>

          {config?.activeUrl && /\/graphql/.test(config.activeUrl) ? (
            <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <strong>Favur GraphQL teamplan erkannt.</strong> Der eingebaute Parser
              kümmert sich um die genestete Struktur (tenants → costCenters → persons →
              shifts), Pausen werden gefiltert, Nachtdienste über Mitternacht korrekt
              berechnet. Die JSON-Path-Felder unten sind in diesem Modus ungenutzt.
            </div>
          ) : (
            <>
              <div className="md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  JSON-Parsing (anhand der Capture-Antwort anpassen)
                </p>
                <p className="text-xs text-ink-muted">
                  Pfad in Punkt-Notation, z.B. <code>data.shifts</code>. Leer lassen
                  wenn die Response selbst schon das Array ist.
                </p>
              </div>
              <Field label="Shifts JSON path"><input type="text" value={shiftsJsonPath} onChange={(e) => setShiftsJsonPath(e.target.value)} placeholder="(leer = root)" className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm" /></Field>
              <Field label="Shift-ID Feld"><input type="text" value={fieldShiftId} onChange={(e) => setFieldShiftId(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm" /></Field>
              <Field label="User-ID Feld"><input type="text" value={fieldUserId} onChange={(e) => setFieldUserId(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm" /></Field>
              <Field label="User-Name Feld"><input type="text" value={fieldUserName} onChange={(e) => setFieldUserName(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm" /></Field>
              <Field label="Start-Feld"><input type="text" value={fieldStartsAt} onChange={(e) => setFieldStartsAt(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm" /></Field>
              <Field label="Ende-Feld"><input type="text" value={fieldEndsAt} onChange={(e) => setFieldEndsAt(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm" /></Field>
              <Field label="Label-Feld (optional)"><input type="text" value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} placeholder="z.B. shiftType.code" className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm" /></Field>
            </>
          )}

          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={updateMut.isPending} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{updateMut.isPending ? 'Speichert…' : 'Speichern'}</button>
            <button
              type="button"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending || !config?.enabled || !config?.hasActiveCapture || config?.syncInProgress}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
            >
              {syncMut.isPending || config?.syncInProgress ? 'Synchronisiert…' : 'Jetzt synchronisieren'}
            </button>
            {syncMut.isError && <span className="text-sm text-rose-700">{(syncMut.error as Error).message}</span>}
            {updateMut.isError && <span className="text-sm text-rose-700">{(updateMut.error as Error).message}</span>}
          </div>
        </form>
      </section>

      {/* ── Captures ── */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Captures von der Extension</h2>
            <p className="text-sm text-ink-muted">
              Jeder API-Call den die Extension auf web.favur.ch beobachtet. Der Backend
              promoted automatisch den ersten Treffer der wie ein Schicht-Array aussieht zu
              „aktiv". Du kannst manuell wechseln.
            </p>
          </div>
        </div>

        {capturesQuery.isLoading ? (
          <p className="mt-4 text-sm text-ink-muted">Lädt…</p>
        ) : (capturesQuery.data?.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            Noch keine Captures. Logge dich auf web.favur.ch ein und navigiere auf den
            Schichtplan — Calls erscheinen automatisch hier (kann ein paar Sekunden dauern).
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {capturesQuery.data!.map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${c.responseStatus >= 200 && c.responseStatus < 300 ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                    {c.method} {c.responseStatus}
                  </span>
                  {c.isActive && (
                    <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">aktiv</span>
                  )}
                  <code className="min-w-0 flex-1 truncate text-xs text-ink">{shortUrl(c.url, 90)}</code>
                  <span className="text-xs text-ink-muted">{formatDateTime(c.capturedAt)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span>{c.responseShape ?? '–'}</span>
                  <span className="ml-auto flex gap-2">
                    <button type="button" onClick={() => setPreviewCaptureId(c.id === previewCaptureId ? null : c.id)} className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-ink hover:bg-surface-muted">{previewCaptureId === c.id ? 'Verbergen' : 'Vorschau'}</button>
                    {!c.isActive && (
                      <button type="button" onClick={() => activateMut.mutate(c.id)} disabled={activateMut.isPending} className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Aktivieren</button>
                    )}
                    {!c.isActive && (
                      <button type="button" onClick={() => deleteCaptureMut.mutate(c.id)} className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100">Löschen</button>
                    )}
                  </span>
                </div>
                {previewCaptureId === c.id && <CapturePreview id={c.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── User mapping ── */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-lg font-semibold text-ink">Mitarbeiter zuordnen</h2>
        <p className="text-sm text-ink-muted">
          Jeder Favur-Mitarbeiter, der in einer Sync-Antwort auftaucht, landet hier.
          Erst nach dem Mapping erscheinen seine Schichten im Schichtplan.
        </p>
        {usersQuery.isLoading ? (
          <p className="mt-4 text-sm text-ink-muted">Lädt…</p>
        ) : (usersQuery.data?.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            Noch keine Favur-Mitarbeiter gesehen. Sobald der erste Sync erfolgreich war,
            erscheinen sie hier.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {usersQuery.data!.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{row.favurDisplayName || row.favurUserId}</p>
                  <p className="truncate text-xs text-ink-muted">Favur-ID: {row.favurUserId} · zuletzt {formatDateTime(row.lastSeenAt)}</p>
                </div>
                {row.user && (
                  <div className="flex items-center gap-2">
                    <Avatar name={row.user.name} url={row.user.avatarUrl} size={28} />
                    <span className="truncate text-xs text-ink">{formatUserWithTitlePrefix(row.user.name, row.user.titlePrefix)}</span>
                  </div>
                )}
                <select
                  value={row.user?.id ?? ''}
                  onChange={(e) => mapUserMut.mutate({ id: row.id, userId: e.target.value || null })}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                  disabled={mapUserMut.isPending}
                >
                  <option value="">— nicht verknüpft —</option>
                  {localUserOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <div className="mt-1 text-sm">{children}</div>
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function SyncStatusBadge({ config }: { config: FavurConfig | undefined }) {
  if (!config) return null;
  const tone =
    config.lastSyncStatus === 'ok'
      ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
      : config.lastSyncStatus === 'error'
        ? 'bg-rose-100 text-rose-900 border-rose-200'
        : 'bg-surface-muted text-ink-muted border-border';
  const label = config.syncInProgress
    ? 'Sync läuft…'
    : config.lastSyncStatus === 'ok'
      ? `OK · ${config.lastSyncCount} Schichten`
      : config.lastSyncStatus === 'error'
        ? 'Fehler'
        : config.hasActiveCapture
          ? 'Bereit'
          : 'Wartet auf Capture';
  return (
    <div className="text-right">
      <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>
      <p className="mt-1 text-xs text-ink-muted">Letzter Lauf: {formatDateTime(config.lastSyncAt)}</p>
      {config.lastSyncStatus === 'error' && config.lastSyncError && (
        <p className="mt-1 max-w-xs text-xs text-rose-700">{config.lastSyncError}</p>
      )}
    </div>
  );
}

function CapturePreview({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['favur-capture', id],
    queryFn: () => api<CaptureDetail>(`/favur/captures/${id}`),
  });
  if (isLoading) return <p className="mt-2 text-xs text-ink-muted">Lädt…</p>;
  if (!data) return null;
  const pretty = (() => {
    try {
      return JSON.stringify(JSON.parse(data.responseSample), null, 2);
    } catch {
      return data.responseSample;
    }
  })();
  return (
    <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-surface-muted p-3 text-[11px] leading-snug text-ink">
      {pretty.slice(0, 12_000)}
      {pretty.length > 12_000 && '\n… (truncated)'}
    </pre>
  );
}
