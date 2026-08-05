'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type MirusConfig = {
  id: string;
  enabled: boolean;
  baseUrl: string;
  windowDays: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncCount: number;
  syncInProgress: boolean;
  mirusUsername: string | null;
  hasMirusPassword: boolean;
  mappedUserCount: number;
  unmappedUserCount: number;
};

type ExternalUserMap = {
  id: string;
  externalUserId: string;
  displayName: string | null;
  lastSeenAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    titlePrefix: string;
    isActive: boolean;
    avatarUrl: string | null;
  } | null;
};

type UserListRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  titlePrefix: string;
  isActive: boolean;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-CH');
}

export default function IntegrationsPage() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['mirus-config'],
    queryFn: () => api<MirusConfig>('/mirus/config'),
    refetchInterval: 10_000,
  });

  const usersQuery = useQuery({
    queryKey: ['mirus-users'],
    queryFn: () => api<ExternalUserMap[]>('/mirus/users'),
    refetchInterval: 30_000,
  });

  const localUsersQuery = useQuery({
    queryKey: ['users-list-min'],
    queryFn: () => api<UserListRow[]>('/users'),
  });

  const updateMut = useMutation({
    mutationFn: (body: {
      enabled?: boolean;
      baseUrl?: string;
      windowDays?: number;
      mirusUsername?: string;
      mirusPassword?: string;
    }) =>
      api<MirusConfig>('/mirus/config', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mirus-config'] });
    },
  });

  const syncMut = useMutation({
    mutationFn: () => api<MirusConfig>('/mirus/sync', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mirus-config'] });
      queryClient.invalidateQueries({ queryKey: ['mirus-users'] });
    },
  });

  const unlockMut = useMutation({
    mutationFn: () => api<MirusConfig>('/mirus/sync/unlock', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mirus-config'] });
    },
  });

  const [mapHint, setMapHint] = useState(false);

  const mapUserMut = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string | null }) =>
      api<ExternalUserMap>(`/mirus/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mirus-users'] });
      queryClient.invalidateQueries({ queryKey: ['mirus-config'] });
      setMapHint(true);
    },
  });

  const config = configQuery.data;

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://neo.mirus.ch');
  const [windowDays, setWindowDays] = useState(14);
  const [mirusUsername, setMirusUsername] = useState('');
  const [mirusPassword, setMirusPassword] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!config || hydrated) return;
    setEnabled(config.enabled);
    setBaseUrl(config.baseUrl || 'https://neo.mirus.ch');
    setWindowDays(config.windowDays);
    setMirusUsername(config.mirusUsername ?? '');
    setHydrated(true);
  }, [config, hydrated]);

  const localUserOptions = useMemo(() => {
    const list = localUsersQuery.data ?? [];
    return list
      .filter((u) => u.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [localUsersQuery.data]);

  const canSync =
    !!config?.enabled &&
    !config.syncInProgress &&
    !syncMut.isPending &&
    (config.hasMirusPassword || mirusPassword.trim().length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Integrationen"
        description="Externe Datenquellen, die in den Schichtplan einfliessen."
        actions={<AppChromeTools />}
      />
      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
      <section className={APP_DARK_CARD + ' p-5'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Schichtplan (Mirus NEO)</h2>
            <p className="text-sm text-sidebar-muted">
              Der Server meldet sich bei{' '}
              <code className="rounded bg-white/10 px-1 py-0.5">neo.mirus.ch</code> an und
              synchronisiert den Schichtplan automatisch alle 15 Minuten.
            </p>
          </div>
          <SyncStatusBadge config={config} />
        </div>

        <ol className="mt-5 space-y-3 text-sm text-white">
          <Step n={1} title="Mirus-Zugangsdaten eintragen">
            <p className="text-sidebar-muted">
              Benutzername und Passwort für neo.mirus.ch speichern. Das Konto muss den Team-Schichtplan
              sehen können (ohne MFA/FIDO2).
            </p>
          </Step>
          <Step n={2} title="Sync aktivieren und einmal synchronisieren">
            <p className="text-sidebar-muted">
              Danach erscheinen die Mirus-Mitarbeiter unten in der Zuordnungsliste.
            </p>
          </Step>
          <Step n={3} title="Mitarbeiter zuordnen, dann erneut syncen">
            <p className="text-sidebar-muted">
              Verknüpfe jeden Mirus-Namen mit dem lokalen Benutzerkonto. Erst nach einem weiteren Sync
              erscheinen die Schichten im Schichtplan.
            </p>
          </Step>
        </ol>

        <form
          className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-sidebar-border bg-white/5 p-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            updateMut.mutate({
              enabled,
              baseUrl: baseUrl.trim() || 'https://neo.mirus.ch',
              windowDays,
              mirusUsername: mirusUsername.trim() || undefined,
              mirusPassword: mirusPassword.trim() || undefined,
            });
            if (mirusPassword.trim()) setMirusPassword('');
          }}
        >
          <label className="md:col-span-2 flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar px-3 py-2.5">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-white">Sync aktiviert</span>
            <span className="ml-auto text-xs text-sidebar-muted">
              Cron alle 15 Minuten · manueller Sync im Hintergrund (ca. 1–3 Min.)
            </span>
          </label>

          <Field label="Mirus Benutzername">
            <input
              type="text"
              autoComplete="username"
              value={mirusUsername}
              onChange={(e) => setMirusUsername(e.target.value)}
              placeholder="E-Mail oder Benutzername"
              className={clsx(APP_DARK_INPUT, 'w-full py-2')}
            />
          </Field>

          <Field label="Mirus Passwort">
            <input
              type="password"
              autoComplete="new-password"
              value={mirusPassword}
              onChange={(e) => setMirusPassword(e.target.value)}
              placeholder={config?.hasMirusPassword ? '•••••••• (leer = unverändert)' : 'Passwort'}
              className={clsx(APP_DARK_INPUT, 'w-full py-2')}
            />
          </Field>

          <Field label="Basis-URL">
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className={clsx(APP_DARK_INPUT, 'w-full py-2')}
            />
          </Field>

          <Field label="Sync-Fenster (Tage)">
            <input
              type="number"
              min={1}
              max={60}
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className={clsx(APP_DARK_INPUT, 'w-full py-2')}
            />
          </Field>

          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action/90 disabled:opacity-50"
            >
              {updateMut.isPending ? 'Speichert…' : 'Speichern'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMapHint(false);
                syncMut.mutate();
              }}
              disabled={!canSync}
              className="rounded-lg border border-sidebar-border bg-transparent px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {syncMut.isPending || config?.syncInProgress ? 'Synchronisiert…' : 'Jetzt synchronisieren'}
            </button>
            {config?.syncInProgress && (
              <button
                type="button"
                onClick={() => unlockMut.mutate()}
                disabled={unlockMut.isPending}
                className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-400/20 disabled:opacity-50"
              >
                {unlockMut.isPending ? 'Setzt zurück…' : 'Hängenden Sync freigeben'}
              </button>
            )}
            {syncMut.isError && (
              <span className="text-sm text-rose-400">{(syncMut.error as Error).message}</span>
            )}
            {unlockMut.isError && (
              <span className="text-sm text-rose-400">{(unlockMut.error as Error).message}</span>
            )}
            {updateMut.isError && (
              <span className="text-sm text-rose-400">{(updateMut.error as Error).message}</span>
            )}
            {updateMut.isSuccess && !updateMut.isPending && (
              <span className="text-sm text-emerald-400">Gespeichert.</span>
            )}
          </div>
        </form>
      </section>

      <section className={APP_DARK_CARD + ' p-5'}>
        <h2 className="text-lg font-semibold text-white">Mitarbeiter zuordnen</h2>
        <p className="text-sm text-sidebar-muted">
          Nur Mirus-Personen aus dem letzten Sync (alte Favur-Einträge werden entfernt). Nur
          verknüpfte Personen erscheinen nach dem nächsten Sync im Schichtplan.
          {config != null && (
            <>
              {' '}
              Verknüpft: {config.mappedUserCount} · offen: {config.unmappedUserCount}.
            </>
          )}
        </p>
        {mapHint && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            Zuordnung gespeichert. Bitte jetzt erneut «Jetzt synchronisieren» klicken, damit die
            Schichten gespeichert werden.
          </p>
        )}
        {usersQuery.isLoading ? (
          <p className="mt-4 text-sm text-sidebar-muted">Lädt…</p>
        ) : (usersQuery.data?.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-sidebar-muted">
            Noch keine Mirus-Mitarbeiter. Zugangsdaten speichern und synchronisieren.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-sidebar-border/40">
            {usersQuery.data!.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">
                    {row.displayName || row.externalUserId}
                  </p>
                  <p className="truncate text-xs text-sidebar-muted">
                    Mirus-ID: {row.externalUserId} · zuletzt {formatDateTime(row.lastSeenAt)}
                  </p>
                </div>
                {row.user && (
                  <div className="flex items-center gap-2">
                    <Avatar name={row.user.name} url={row.user.avatarUrl} size={28} />
                    <span className="truncate text-xs text-white">
                      {formatUserWithTitlePrefix(row.user.name, row.user.titlePrefix)}
                    </span>
                  </div>
                )}
                <select
                  value={row.user?.id ?? ''}
                  onChange={(e) =>
                    mapUserMut.mutate({ id: row.id, userId: e.target.value || null })
                  }
                  className={clsx(APP_DARK_INPUT, 'py-1.5')}
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
      </AppPageBody>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action text-xs font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">{title}</p>
        <div className="mt-1 text-sm">{children}</div>
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function SyncStatusBadge({ config }: { config: MirusConfig | undefined }) {
  if (!config) return null;
  const tone =
    config.lastSyncStatus === 'ok'
      ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
      : config.lastSyncStatus === 'warn'
        ? 'bg-amber-400/15 text-amber-300 border-amber-400/30'
        : config.lastSyncStatus === 'error'
          ? 'bg-rose-400/15 text-rose-300 border-rose-400/30'
          : 'bg-white/10 text-sidebar-muted border-sidebar-border';
  const label = config.syncInProgress
    ? 'Sync läuft… (1–3 Min.)'
    : config.lastSyncStatus === 'ok'
      ? `OK · ${config.lastSyncCount} Schichten`
      : config.lastSyncStatus === 'warn'
        ? 'Hinweis'
        : config.lastSyncStatus === 'error'
          ? 'Fehler'
          : config.hasMirusPassword
            ? 'Bereit'
            : 'Zugangsdaten fehlen';
  return (
    <div className="text-right">
      <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
        {label}
      </span>
      <p className="mt-1 text-xs text-sidebar-muted">Letzter Lauf: {formatDateTime(config.lastSyncAt)}</p>
      {(config.lastSyncStatus === 'error' || config.lastSyncStatus === 'warn' || config.lastSyncStatus === 'ok') &&
        config.lastSyncError && (
          <p
            className={`mt-1 max-w-sm text-xs ${
              config.lastSyncStatus === 'ok' ? 'text-sidebar-muted' : 'text-rose-400'
            }`}
          >
            {config.lastSyncError}
          </p>
        )}
    </div>
  );
}
