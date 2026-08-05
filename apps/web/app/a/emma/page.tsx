'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PermissionToggle } from '@/components/admin/PermissionToggle';
import type { ReservationSyncStatus, EmmaIntegrationStatus } from '@housekeeping/shared';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

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

  const reservationStatusQuery = useQuery({
    queryKey: ['reservations', 'sync-status'],
    queryFn: () => api<ReservationSyncStatus>('/reservations/sync-status'),
    refetchInterval: 30_000,
  });

  const integrationStatusQuery = useQuery({
    queryKey: ['emma', 'integration-status'],
    queryFn: () => api<EmmaIntegrationStatus>('/emma/integration-status'),
    refetchInterval: 15_000,
  });

  const backupModeMut = useMutation({
    mutationFn: (manual: boolean) =>
      api<EmmaIntegrationStatus>('/emma/backup-mode', {
        method: 'PATCH',
        body: JSON.stringify({ manual }),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['emma', 'integration-status'], next);
    },
  });

  const syncReservationsMut = useMutation({
    mutationFn: () =>
      api<{ upserted: number; syncedAt: string }>('/reservations/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });

  const meta = metaQuery.data;
  const emmaActive = meta?.integrationEnabled !== false;
  const backupMode = integrationStatusQuery.data?.backupMode;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="EMMA (SAP Fiori)"
        description="Zugangsdaten für die automatisierte Anmeldung am EMMA Launchpad. Nur Admins haben Zugriff auf diese Seite."
        actions={<AppChromeTools />}
      />
      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">

      <section className={APP_DARK_CARD + ' p-5'}>
        <h2 className="text-lg font-semibold text-white">EMMA-Integration</h2>
        <p className="mt-1 text-sm text-sidebar-muted">
          Schaltet automatischen Zimmerstatus-Sync (Cron, Zimmerlisten, Housekeeping-Aktionen),
          manuellen Sync und HTTP-Login (Cookies) ab. Zugangsdaten bleiben gespeichert.
        </p>
        <div className="mt-4 rounded-xl border border-sidebar-border bg-white/5">
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
          <p className="mt-3 text-sm text-rose-400">{(integrationMut.error as Error).message}</p>
        )}
        {!emmaActive && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            EMMA ist ausgeschaltet. Hintergrund-Sync und automatischer Re-Login laufen nicht.
          </p>
        )}
      </section>

      <section className="rounded-card border border-rose-400/30 bg-rose-500/10 p-5 text-slate-100 shadow-none">
        <h2 className="text-lg font-semibold text-white">Front Office Backup-Modus</h2>
        <p className="mt-1 text-sm text-sidebar-muted">
          Schaltet die EMMA-Backup-Übersicht für die Rezeption ein — unabhängig davon, ob EMMA
          erreichbar ist. Nützlich für Tests und manuelle Notfall-Vorbereitung.
        </p>
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-white/5">
          <PermissionToggle
            title="Manueller Backup-Modus"
            description={
              backupMode?.manual
                ? 'Rezeption sieht die Kategorie „Front Office“ und das Panik-Banner.'
                : backupMode?.nightAuditGrace
                  ? 'Night Audit (02–07 Uhr): EMMA kurz offline — Backup wird erst nach 30 Min. oder ab 07:00 aktiviert.'
                  : backupMode?.active
                  ? `Backup aktiv (${backupMode.reasons.join(', ')}) — ohne manuellen Schalter.`
                  : 'Backup nur bei EMMA-Ausfall (Push-Fehler oder Reservierungs-Sync).'
            }
            checked={backupMode?.manual === true}
            disabled={backupModeMut.isPending || integrationStatusQuery.isLoading}
            onChange={(next) => backupModeMut.mutate(next)}
          />
        </div>
        {backupModeMut.isError ? (
          <p className="mt-2 text-sm text-rose-400">Backup-Modus konnte nicht gespeichert werden.</p>
        ) : null}
      </section>

      <section className={APP_DARK_CARD + ' p-5'}>
        <h2 className="text-lg font-semibold text-white">Zugangsdaten</h2>
        {metaQuery.isLoading ? (
          <p className="mt-3 text-sm text-sidebar-muted">Lädt…</p>
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
            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-sidebar-border bg-white/5 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                Stufe 1 · ADFS (Microsoft Sign-In)
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  E-Mail (ADFS-Konto)
                </span>
                <input
                  type="email"
                  autoComplete="off"
                  value={adfsEmail}
                  onChange={(e) => setAdfsEmail(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2'}
                  placeholder="vorname.name@prizebyradisson.com"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  ADFS-Passwort
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={adfsPassword}
                  onChange={(e) => setAdfsPassword(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2'}
                  placeholder={meta?.hasAdfsPassword ? 'Neu eintragen zum Ersetzen …' : 'Passwort'}
                />
                {meta?.hasAdfsPassword && (
                  <p className="mt-1 text-xs text-sidebar-muted">
                    Es ist bereits ein ADFS-Passwort gespeichert. Leer lassen, um es zu behalten.
                  </p>
                )}
              </label>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-sidebar-border bg-white/5 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                Stufe 2 · MFA (TOTP)
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  TOTP-Seed (Base32)
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2 font-mono'}
                  placeholder={
                    meta?.hasTotpSecret
                      ? 'Neuen Seed eintragen zum Ersetzen …'
                      : 'z. B. JVDS… (aus otpauth:// QR, secret=…)'
                  }
                />
                {meta?.hasTotpSecret && (
                  <p className="mt-1 text-xs text-sidebar-muted">
                    Es ist bereits ein TOTP-Seed gespeichert. Leer lassen, um ihn zu behalten.
                  </p>
                )}
              </label>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-sidebar-border bg-white/5 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                Stufe 3 · SAP-Logon
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  SAP-Benutzer
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={sapUser}
                  onChange={(e) => setSapUser(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2'}
                  placeholder="z. B. CHBRNPRF2"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  SAP-Passwort
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={sapPassword}
                  onChange={(e) => setSapPassword(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2'}
                  placeholder={meta?.hasSapPassword ? 'Neu eintragen zum Ersetzen …' : 'Passwort'}
                />
                {meta?.hasSapPassword && (
                  <p className="mt-1 text-xs text-sidebar-muted">
                    Es ist bereits ein SAP-Passwort gespeichert. Leer lassen, um es zu behalten.
                  </p>
                )}
              </label>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-sidebar-border bg-white/5 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                Stufe 4 · Property-Modal
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  Operator-Code
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={operatorCode}
                  onChange={(e) => setOperatorCode(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2'}
                  placeholder="z. B. 47032"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  Till (Folio / Rechnung)
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={tillName}
                  onChange={(e) => setTillName(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2'}
                  placeholder="z. B. FD1013 - David Eich"
                />
                <p className="mt-1 text-xs text-sidebar-muted">
                  Exakter Text wie in der EMMA-Combobox „Tills“ (Till and Employee nach Cancel
                  Invoice).
                </p>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  Operator-Passwort
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2'}
                  placeholder={
                    meta?.hasOperatorPassword ? 'Neu eintragen zum Ersetzen …' : 'Passwort'
                  }
                />
                {meta?.hasOperatorPassword && (
                  <p className="mt-1 text-xs text-sidebar-muted">
                    Es ist bereits ein Operator-Passwort gespeichert. Leer lassen, um es zu behalten.
                  </p>
                )}
              </label>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-sidebar-border bg-white/5 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                Optional · Launchpad-URL überschreiben
              </legend>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                  Base URL
                </span>
                <input
                  type="url"
                  autoComplete="off"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className={APP_DARK_INPUT + ' w-full py-2 font-mono'}
                  placeholder="https://emma.rhg.radissonhotels.com/sap/bc/ui2/flp"
                />
                <p className="mt-1 text-xs text-sidebar-muted">
                  Leer lassen für Standard-URL.
                </p>
              </label>
            </fieldset>

            <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-200">
              Alle Passwörter und der TOTP-Seed werden mit AES-256-GCM verschlüsselt
              gespeichert (Schlüssel: <code>FAVUR_ENCRYPTION_KEY</code> auf dem Server).
              Diese Seite gibt sie nie wieder im Klartext aus.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action/90 disabled:opacity-50"
              >
                {saveMut.isPending ? 'Speichert …' : 'Speichern'}
              </button>
              {saveMut.isError && (
                <span className="text-sm text-rose-400">
                  {(saveMut.error as Error).message}
                </span>
              )}
              {saveMut.isSuccess && !saveMut.isPending && (
                <span className="text-sm text-emerald-400">Gespeichert.</span>
              )}
            </div>
          </form>
        )}
      </section>

      <section className={APP_DARK_CARD + ' p-5'}>
        <h2 className="text-lg font-semibold text-white">HTTP-Session</h2>
        <p className="mt-1 text-sm text-sidebar-muted">
          Einmaliger Login per HTTP (ADFS, MFA, SAP) — speichert Cookies für den schnellen
          Zimmerstatus-Sync. Dauert typisch 30–60 Sekunden. Kein Browser auf dem Server.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => refreshHttpMut.mutate()}
            disabled={refreshHttpMut.isPending || !emmaActive}
            className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action/90 disabled:opacity-50"
            title={!emmaActive ? 'EMMA-Integration ist deaktiviert' : undefined}
          >
            {refreshHttpMut.isPending ? 'Session wird erneuert …' : 'HTTP-Session erneuern'}
          </button>
          <button
            type="button"
            onClick={() => invalidateMut.mutate()}
            disabled={invalidateMut.isPending}
            className="rounded-lg border border-sidebar-border bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            title="Löscht gespeicherte EMMA-Cookies; beim nächsten Sync wird neu eingeloggt."
          >
            {invalidateMut.isPending ? 'Setze zurück …' : 'Session zurücksetzen'}
          </button>
        </div>

        {refreshHttpMut.isSuccess && refreshHttpMut.data && (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
            <p className="font-semibold">HTTP-Session gespeichert.</p>
            <p className="mt-1 text-xs text-emerald-300/80">
              {refreshHttpMut.data.cookieCount} Cookies · {refreshHttpMut.data.savedAt}
            </p>
          </div>
        )}
        {refreshHttpMut.isError && (
          <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
            <p className="font-semibold">Session fehlgeschlagen.</p>
            <p className="mt-1 break-words">{(refreshHttpMut.error as Error).message}</p>
          </div>
        )}
        {invalidateMut.isSuccess && !invalidateMut.isPending && (
          <p className="mt-3 text-sm text-emerald-400">HTTP-Session zurückgesetzt.</p>
        )}
      </section>

      <section className={APP_DARK_CARD + ' p-5'}>
        <h2 className="text-lg font-semibold text-white">Zimmerstatus-Sync</h2>
        <p className="mt-1 text-sm text-sidebar-muted">
          Lädt Housekeeping-Status aus EMMA (OData) und schreibt ihn auf die lokalen Zimmer.
          Dauert typisch einige Sekunden, wenn die HTTP-Session gültig ist — sonst wird zuerst
          automatisch neu eingeloggt. Zusätzlich läuft der Sync alle 5 Minuten im Hintergrund.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => syncRoomsMut.mutate()}
            disabled={syncRoomsMut.isPending || !emmaActive}
            className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action/90 disabled:opacity-50"
            title={!emmaActive ? 'EMMA-Integration ist deaktiviert' : undefined}
          >
            {syncRoomsMut.isPending ? 'Synchronisiere …' : 'Zimmer jetzt synchronisieren'}
          </button>
        </div>

        {syncRoomsMut.isSuccess && syncRoomsMut.data && (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
            <p className="font-semibold">Sync abgeschlossen.</p>
            <p className="mt-1 text-xs text-emerald-300/80">
              {syncRoomsMut.data.matched} von {syncRoomsMut.data.emmaRooms} EMMA-Zimmern gematcht ·{' '}
              {syncRoomsMut.data.updated} aktualisiert · Hotel {syncRoomsMut.data.hotelId} ·{' '}
              {new Date(syncRoomsMut.data.syncedAt).toLocaleString('de-CH')}
            </p>
          </div>
        )}
        {syncRoomsMut.isError && (
          <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
            <p className="font-semibold">Sync fehlgeschlagen.</p>
            <p className="mt-1 break-words">{(syncRoomsMut.error as Error).message}</p>
          </div>
        )}
      </section>

      <section className={APP_DARK_CARD + ' p-5'}>
        <h2 className="text-lg font-semibold text-white">Reservierungen (Check-In)</h2>
        <p className="mt-1 text-sm text-sidebar-muted">
          Synchronisiert Anreisen, Check-in-Queue und Im-Haus aus EMMA Check-In OData. Gästedaten
          werden verschlüsselt in PostgreSQL gespeichert. Cron alle 3 Minuten (konfigurierbar).
        </p>

        {reservationStatusQuery.data?.lastRun && (
          <div className="mt-4 rounded-lg border border-sidebar-border bg-white/5 p-3 text-sm text-slate-100">
            <p>
              Letzter Lauf:{' '}
              <span className="font-medium text-white">{reservationStatusQuery.data.lastRun.status}</span>
              {' · '}
              {new Date(reservationStatusQuery.data.lastRun.startedAt).toLocaleString('de-CH')}
              {reservationStatusQuery.data.lastRun.rowCount != null &&
                ` · ${reservationStatusQuery.data.lastRun.rowCount} Zeilen`}
            </p>
            {reservationStatusQuery.data.lastRun.error && (
              <p className="mt-2 text-rose-400">{reservationStatusQuery.data.lastRun.error}</p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => syncReservationsMut.mutate()}
            disabled={syncReservationsMut.isPending || !emmaActive}
            className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action/90 disabled:opacity-50"
          >
            {syncReservationsMut.isPending ? 'Synchronisiere …' : 'Reservierungen synchronisieren'}
          </button>
        </div>

        {syncReservationsMut.isSuccess && syncReservationsMut.data && (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
            <p className="font-semibold">Reservierungs-Sync abgeschlossen.</p>
            <p className="mt-1 text-xs text-emerald-300/80">
              {syncReservationsMut.data.upserted} upserted ·{' '}
              {new Date(syncReservationsMut.data.syncedAt).toLocaleString('de-CH')}
            </p>
          </div>
        )}
        {syncReservationsMut.isError && (
          <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
            <p className="font-semibold">Reservierungs-Sync fehlgeschlagen.</p>
            <p className="mt-1 break-words">{(syncReservationsMut.error as Error).message}</p>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-indigo-400/30 bg-indigo-400/10 p-4 text-sm text-indigo-200">
          <p className="font-semibold text-white">Anreise-Check Vorschau</p>
          <p className="mt-1 text-indigo-200/80">
            Den Lauf-Bildschirm (Fortschritt, manuelle Fälle, VCC) ohne echten EMMA-Lauf testen.
          </p>
          <Link
            href="/a/arrival-check"
            className="mt-3 inline-flex rounded-lg border border-indigo-400/40 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
          >
            Vorschau öffnen →
          </Link>
        </div>
      </section>
        </div>
      </AppPageBody>
    </div>
  );
}
