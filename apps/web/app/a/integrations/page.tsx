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
  email: string | null;
  hasPassword: boolean;
  windowDays: number;
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

function formatDateTime(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-CH');
}

export default function FavurIntegrationPage() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['favur-config'],
    queryFn: () => api<FavurConfig>('/favur/config'),
    refetchInterval: 15_000,
  });

  const usersQuery = useQuery({
    queryKey: ['favur-users'],
    queryFn: () => api<FavurUserMap[]>('/favur/users'),
  });

  const localUsersQuery = useQuery({
    queryKey: ['users-list-min'],
    queryFn: () => api<UserListRow[]>('/users'),
  });

  const updateMut = useMutation({
    mutationFn: (body: Partial<{
      enabled: boolean;
      baseUrl: string;
      email: string;
      password: string;
      windowDays: number;
    }>) =>
      api<FavurConfig>('/favur/config', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
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

  // Local form state, hydrated from server.
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://web.favur.ch');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [windowDays, setWindowDays] = useState(14);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!config || hydrated) return;
    setEnabled(config.enabled);
    setBaseUrl(config.baseUrl);
    setEmail(config.email ?? '');
    setWindowDays(config.windowDays);
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

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Favur</h2>
            <p className="text-sm text-ink-muted">
              Schichten werden alle 15 Minuten von web.favur.ch importiert.
              Login wird verschlüsselt gespeichert.
            </p>
          </div>
          <SyncStatusBadge config={config} />
        </div>

        <form
          className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body: Record<string, unknown> = {
              enabled,
              baseUrl,
              email,
              windowDays,
            };
            if (password.trim()) body.password = password;
            updateMut.mutate(body, {
              onSuccess: () => setPassword(''),
            });
          }}
        >
          <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-ink">Sync aktiviert</span>
            <span className="text-xs text-ink-muted">
              {enabled
                ? 'Cron läuft alle 15 min und der manuelle Sync-Button ist aktiv.'
                : 'Sync ist pausiert (weder Cron noch manuell).'}
            </span>
          </label>

          <Field label="Basis-URL" hint="Normalerweise https://web.favur.ch">
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              required
            />
          </Field>

          <Field label="Sync-Fenster (Tage)" hint="Heute + N Tage in die Zukunft">
            <input
              type="number"
              min={1}
              max={60}
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </Field>

          <Field label="E-Mail (Favur Login)">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Passwort"
            hint={
              config?.hasPassword
                ? 'Gespeichert. Leer lassen, um es nicht zu ändern.'
                : 'Wird AES-256-GCM-verschlüsselt gespeichert.'
            }
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={config?.hasPassword ? '••••••••' : ''}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </Field>

          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {updateMut.isPending ? 'Speichert…' : 'Speichern'}
            </button>
            <button
              type="button"
              onClick={() => syncMut.mutate()}
              disabled={
                syncMut.isPending ||
                !config?.enabled ||
                !config?.hasPassword ||
                config?.syncInProgress
              }
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
            >
              {syncMut.isPending || config?.syncInProgress
                ? 'Synchronisiert…'
                : 'Jetzt synchronisieren'}
            </button>
            {updateMut.isError && (
              <span className="text-sm text-rose-700">
                {(updateMut.error as Error).message}
              </span>
            )}
            {syncMut.isError && (
              <span className="text-sm text-rose-700">
                {(syncMut.error as Error).message}
              </span>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Mitarbeiter zuordnen</h2>
            <p className="text-sm text-ink-muted">
              Jeder Favur-Mitarbeiter, der in einer Sync-Antwort auftaucht, landet
              hier. Erst nach dem Mapping erscheinen seine Schichten im Schichtplan.
            </p>
          </div>
        </div>

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
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">
                    {row.favurDisplayName || row.favurUserId}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    Favur-ID: {row.favurUserId} · zuletzt gesehen{' '}
                    {formatDateTime(row.lastSeenAt)}
                  </p>
                </div>

                {row.user && (
                  <div className="flex items-center gap-2">
                    <Avatar name={row.user.name} url={row.user.avatarUrl} size={28} />
                    <span className="truncate text-xs text-ink">
                      {formatUserWithTitlePrefix(row.user.name, row.user.titlePrefix)}
                    </span>
                  </div>
                )}

                <select
                  value={row.user?.id ?? ''}
                  onChange={(e) =>
                    mapUserMut.mutate({
                      id: row.id,
                      userId: e.target.value || null,
                    })
                  }
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
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
        : 'Noch nie synchronisiert';
  return (
    <div className="text-right">
      <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
        {label}
      </span>
      <p className="mt-1 text-xs text-ink-muted">
        Letzter Lauf: {formatDateTime(config.lastSyncAt)}
      </p>
      {config.lastSyncStatus === 'error' && config.lastSyncError && (
        <p className="mt-1 max-w-xs text-xs text-rose-700">{config.lastSyncError}</p>
      )}
    </div>
  );
}
