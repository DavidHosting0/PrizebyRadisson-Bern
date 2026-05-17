'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PermissionToggle } from '@/components/admin/PermissionToggle';

type EmmaMeta = {
  integrationEnabled: boolean;
  adfsEmail: string | null;
  sapUser: string | null;
  operatorCode: string | null;
  tillName: string | null;
  baseUrl: string | null;
  hasAdfsPassword: boolean;
  hasTotpSecret: boolean;
  hasSapPassword: boolean;
  hasOperatorPassword: boolean;
};

type SavePayload = {
  integrationEnabled?: boolean;
  adfsEmail?: string;
  adfsPassword?: string;
  totpSecret?: string;
  sapUser?: string;
  sapPassword?: string;
  operatorCode?: string;
  operatorPassword?: string;
  tillName?: string;
  baseUrl?: string;
};

type RefreshHttpResult = {
  ok: true;
  savedAt: string;
  cookieCount: number;
};

type RoomStatusSyncResult = {
  hotelId: string;
  syncedAt: string;
  emmaRooms: number;
  matched: number;
  updated: number;
  unmatchedEmma: string[];
  unmatchedLocal: string[];
};

export default function AdminEmmaCredentialsPage() {
  const queryClient = useQueryClient();
  const metaQuery = useQuery({
    queryKey: ['settings', 'emma-login'],
    queryFn: () => api<EmmaMeta>('/settings/emma-login'),
  });

  const [adfsEmail, setAdfsEmail] = useState('');
  const [adfsPassword, setAdfsPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [sapUser, setSapUser] = useState('');
  const [sapPassword, setSapPassword] = useState('');
  const [operatorCode, setOperatorCode] = useState('');
  const [tillName, setTillName] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    if (metaQuery.data && !metaQuery.isFetching) {
      setAdfsEmail(metaQuery.data.adfsEmail ?? '');
      setSapUser(metaQuery.data.sapUser ?? '');
      setOperatorCode(metaQuery.data.operatorCode ?? '');
      setTillName(metaQuery.data.tillName ?? '');
      setBaseUrl(metaQuery.data.baseUrl ?? '');
    }
  }, [metaQuery.data, metaQuery.isFetching]);

  const saveMut = useMutation({
    mutationFn: (body: SavePayload) =>
      api<EmmaMeta>('/settings/emma-login', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings', 'emma-login'], next);
      // Clear the password/seed fields so they don't get re-submitted by accident.
      setAdfsPassword('');
      setTotpSecret('');
      setSapPassword('');
      setOperatorPassword('');
    },
  });

  const refreshHttpMut = useMutation({
    mutationFn: () =>
      api<RefreshHttpResult>('/emma/session/refresh-http', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  });

  const invalidateMut = useMutation({
    mutationFn: () =>
      api<{ ok: true }>('/emma/session/invalidate', { method: 'POST' }),
  });

  const integrationMut = useMutation({
    mutationFn: (integrationEnabled: boolean) =>
      api<EmmaMeta>('/settings/emma-login', {
        method: 'PATCH',
        body: JSON.stringify({ integrationEnabled }),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings', 'emma-login'], next);
    },
  });

  const syncRoomsMut = useMutation({
    mutationFn: () =>
      api<RoomStatusSyncResult>('/emma/room-status/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  const meta = metaQuery.data;
  const emmaActive = meta?.integrationEnabled !== false;

  return (
    <div className="space-y-8 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">EMMA (SAP Fiori)</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Zugangsdaten für die automatisierte Anmeldung am EMMA Launchpad{' '}
          <span className="whitespace-nowrap">(emma.rhg.radissonhotels.com)</span>. Der Login
          läuft in vier Stufen ab — ADFS, MFA, SAP-Logon und Property-Modal —
          und alle Passwörter sowie der TOTP-Seed werden in der Datenbank
          AES-256-GCM-verschlüsselt abgelegt. Nur Admins haben Zugriff auf
          diese Seite.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-lg font-semibold text-ink">EMMA-Integration</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Schaltet automatischen Zimmerstatus-Sync (Cron, Zimmerlisten, Housekeeping-Aktionen),
          manuellen Sync und HTTP-Login (Cookies) ab. Zugangsdaten bleiben gespeichert.
        </p>
        <div className="mt-4 rounded-xl border border-border bg-surface-muted/40">
          <PermissionToggle
            title="EMMA-Integration aktiv"
            description={
              emmaActive
                ? 'Sync und Session-Erneuerung sind erlaubt.'
                : 'Kein EMMA-Login, kein Sync — nur Zugangsdaten bearbeiten oder Session löschen.'
            }
            checked={emmaActive}
            disabled={integrationMut.isPending || metaQuery.isLoading}
            onChange={(next) => integrationMut.mutate(next)}
          />
        </div>
        {integrationMut.isError && (
          <p className="mt-3 text-sm text-rose-700">{(integrationMut.error as Error).message}</p>
        )}
        {!emmaActive && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            EMMA ist ausgeschaltet. Hintergrund-Sync und automatischer Re-Login laufen nicht.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-lg font-semibold text-ink">Zugangsdaten</h2>
        {metaQuery.isLoading ? (
          <p className="mt-3 text-sm text-ink-muted">Lädt…</p>
        ) : (
          <form
            className="mt-4 grid max-w-2xl grid-cols-1 gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              const body: SavePayload = {};
              if (adfsEmail.trim() !== (meta?.adfsEmail ?? '')) {
                body.adfsEmail = adfsEmail.trim();
              }
              if (adfsPassword.length > 0) body.adfsPassword = adfsPassword;
              const seed = totpSecret.trim().replace(/\s+/g, '');
              if (seed.length > 0) body.totpSecret = seed;
              if (sapUser.trim() !== (meta?.sapUser ?? '')) {
                body.sapUser = sapUser.trim();
              }
              if (sapPassword.length > 0) body.sapPassword = sapPassword;
              if (operatorCode.trim() !== (meta?.operatorCode ?? '')) {
                body.operatorCode = operatorCode.trim();
              }
              if (tillName.trim() !== (meta?.tillName ?? '')) {
                body.tillName = tillName.trim();
              }
              if (operatorPassword.length > 0) {
                body.operatorPassword = operatorPassword;
              }
              if (baseUrl.trim() !== (meta?.baseUrl ?? '')) {
                body.baseUrl = baseUrl.trim();
              }
              if (Object.keys(body).length === 0) return;
              saveMut.mutate(body);
            }}
          >
            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-muted/40 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Stufe 1 · ADFS (Microsoft Sign-In)
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  E-Mail (ADFS-Konto)
                </span>
                <input
                  type="email"
                  autoComplete="off"
                  value={adfsEmail}
                  onChange={(e) => setAdfsEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="vorname.name@prizebyradisson.com"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  ADFS-Passwort
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={adfsPassword}
                  onChange={(e) => setAdfsPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder={meta?.hasAdfsPassword ? 'Neu eintragen zum Ersetzen …' : 'Passwort'}
                />
                {meta?.hasAdfsPassword && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Es ist bereits ein ADFS-Passwort gespeichert. Leer lassen, um es zu behalten.
                  </p>
                )}
              </label>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-muted/40 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Stufe 2 · MFA (TOTP)
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  TOTP-Seed (Base32)
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm"
                  placeholder={
                    meta?.hasTotpSecret
                      ? 'Neuen Seed eintragen zum Ersetzen …'
                      : 'z. B. JVDS… (aus otpauth:// QR, secret=…)'
                  }
                />
                {meta?.hasTotpSecret && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Es ist bereits ein TOTP-Seed gespeichert. Leer lassen, um ihn zu behalten.
                  </p>
                )}
              </label>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-muted/40 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Stufe 3 · SAP-Logon
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  SAP-Benutzer
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={sapUser}
                  onChange={(e) => setSapUser(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="z. B. CHBRNPRF2"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  SAP-Passwort
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={sapPassword}
                  onChange={(e) => setSapPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder={meta?.hasSapPassword ? 'Neu eintragen zum Ersetzen …' : 'Passwort'}
                />
                {meta?.hasSapPassword && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Es ist bereits ein SAP-Passwort gespeichert. Leer lassen, um es zu behalten.
                  </p>
                )}
              </label>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-muted/40 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Stufe 4 · Property-Modal
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Operator-Code
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={operatorCode}
                  onChange={(e) => setOperatorCode(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="z. B. 47032"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Till (Folio / Rechnung)
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={tillName}
                  onChange={(e) => setTillName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="z. B. FD1013 - David Eich"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Exakter Text wie in der EMMA-Combobox „Tills“ (Till and Employee nach Cancel
                  Invoice).
                </p>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Operator-Passwort
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder={
                    meta?.hasOperatorPassword ? 'Neu eintragen zum Ersetzen …' : 'Passwort'
                  }
                />
                {meta?.hasOperatorPassword && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Es ist bereits ein Operator-Passwort gespeichert. Leer lassen, um es zu behalten.
                  </p>
                )}
              </label>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-muted/40 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Optional · Launchpad-URL überschreiben
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Base URL
                </span>
                <input
                  type="url"
                  autoComplete="off"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm"
                  placeholder="https://emma.rhg.radissonhotels.com/sap/bc/ui2/flp"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Leer lassen für Standard-URL.
                </p>
              </label>
            </fieldset>

            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
              Alle Passwörter und der TOTP-Seed werden mit AES-256-GCM verschlüsselt
              gespeichert (Schlüssel: <code>FAVUR_ENCRYPTION_KEY</code> auf dem Server).
              Diese Seite gibt sie nie wieder im Klartext aus.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saveMut.isPending ? 'Speichert …' : 'Speichern'}
              </button>
              {saveMut.isError && (
                <span className="text-sm text-rose-700">
                  {(saveMut.error as Error).message}
                </span>
              )}
              {saveMut.isSuccess && !saveMut.isPending && (
                <span className="text-sm text-emerald-800">Gespeichert.</span>
              )}
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-lg font-semibold text-ink">HTTP-Session</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Einmaliger Login per HTTP (ADFS, MFA, SAP) — speichert Cookies für den schnellen
          Zimmerstatus-Sync. Dauert typisch 30–60 Sekunden. Kein Browser auf dem Server.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => refreshHttpMut.mutate()}
            disabled={refreshHttpMut.isPending || !emmaActive}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            title={!emmaActive ? 'EMMA-Integration ist deaktiviert' : undefined}
          >
            {refreshHttpMut.isPending ? 'Session wird erneuert …' : 'HTTP-Session erneuern'}
          </button>
          <button
            type="button"
            onClick={() => invalidateMut.mutate()}
            disabled={invalidateMut.isPending}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
            title="Löscht gespeicherte EMMA-Cookies; beim nächsten Sync wird neu eingeloggt."
          >
            {invalidateMut.isPending ? 'Setze zurück …' : 'Session zurücksetzen'}
          </button>
        </div>

        {refreshHttpMut.isSuccess && refreshHttpMut.data && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <p className="font-semibold">HTTP-Session gespeichert.</p>
            <p className="mt-1 text-xs text-emerald-900/80">
              {refreshHttpMut.data.cookieCount} Cookies · {refreshHttpMut.data.savedAt}
            </p>
          </div>
        )}
        {refreshHttpMut.isError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <p className="font-semibold">Session fehlgeschlagen.</p>
            <p className="mt-1 break-words">{(refreshHttpMut.error as Error).message}</p>
          </div>
        )}
        {invalidateMut.isSuccess && !invalidateMut.isPending && (
          <p className="mt-3 text-sm text-emerald-800">HTTP-Session zurückgesetzt.</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-lg font-semibold text-ink">Zimmerstatus-Sync</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Lädt Housekeeping-Status aus EMMA (OData) und schreibt ihn auf die lokalen Zimmer.
          Dauert typisch einige Sekunden, wenn die HTTP-Session gültig ist — sonst wird zuerst
          automatisch neu eingeloggt. Zusätzlich läuft der Sync alle 5 Minuten im Hintergrund.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => syncRoomsMut.mutate()}
            disabled={syncRoomsMut.isPending || !emmaActive}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            title={!emmaActive ? 'EMMA-Integration ist deaktiviert' : undefined}
          >
            {syncRoomsMut.isPending ? 'Synchronisiere …' : 'Zimmer jetzt synchronisieren'}
          </button>
        </div>

        {syncRoomsMut.isSuccess && syncRoomsMut.data && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <p className="font-semibold">Sync abgeschlossen.</p>
            <p className="mt-1 text-xs text-emerald-900/80">
              {syncRoomsMut.data.matched} von {syncRoomsMut.data.emmaRooms} EMMA-Zimmern gematcht ·{' '}
              {syncRoomsMut.data.updated} aktualisiert · Hotel {syncRoomsMut.data.hotelId} ·{' '}
              {new Date(syncRoomsMut.data.syncedAt).toLocaleString('de-CH')}
            </p>
          </div>
        )}
        {syncRoomsMut.isError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <p className="font-semibold">Sync fehlgeschlagen.</p>
            <p className="mt-1 break-words">{(syncRoomsMut.error as Error).message}</p>
          </div>
        )}
      </section>
    </div>
  );
}
