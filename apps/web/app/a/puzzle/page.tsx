'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

type PuzzleMeta = {
  email: string | null;
  hasPassword: boolean;
  hasTotpSecret: boolean;
};

export default function AdminPuzzleCredentialsPage() {
  const queryClient = useQueryClient();
  const metaQuery = useQuery({
    queryKey: ['settings', 'puzzle-login'],
    queryFn: () => api<PuzzleMeta>('/settings/puzzle-login'),
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');

  useEffect(() => {
    if (metaQuery.data && !metaQuery.isFetching) {
      setEmail(metaQuery.data.email ?? '');
    }
  }, [metaQuery.data, metaQuery.isFetching]);

  const saveMut = useMutation({
    mutationFn: (body: { email: string; password?: string; totpSecret?: string }) =>
      api<PuzzleMeta>('/settings/puzzle-login', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings', 'puzzle-login'], next);
      setPassword('');
      setTotpSecret('');
    },
  });

  const meta = metaQuery.data;

  return (
    <div className="space-y-8 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Puzzle (Puzzel)</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Anmeldedaten für die automatisierte Anmeldung am Puzzel-Ticketportal (z. B.{' '}
          <span className="whitespace-nowrap">radissonemea.cm.puzzel.com</span>). Nur sichtbar für
          Administratoren.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        {metaQuery.isLoading ? (
          <p className="text-sm text-ink-muted">Lädt…</p>
        ) : (
          <form
            className="grid max-w-xl grid-cols-1 gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              const body: { email: string; password?: string; totpSecret?: string } = {
                email: email.trim(),
              };
              if (password.trim().length > 0) {
                body.password = password;
              }
              const seed = totpSecret.trim().replace(/\s+/g, '');
              if (seed.length > 0) {
                body.totpSecret = seed;
              }
              saveMut.mutate(body);
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">E-Mail (Puzzel ID)</span>
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm"
                placeholder="name@firma.com"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Passwort</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm"
                placeholder={meta?.hasPassword ? 'Neu eintragen zum Ersetzen …' : 'Passwort'}
              />
              {meta?.hasPassword && (
                <p className="mt-1 text-xs text-ink-muted">Es ist bereits ein Passwort gespeichert. Leer lassen, um es zu behalten.</p>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">2FA Seed (TOTP, Base32)</span>
              <input
                type="password"
                autoComplete="off"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-sm"
                placeholder={meta?.hasTotpSecret ? 'Neuen Seed eintragen zum Ersetzen …' : 'z. B. aus otpauth:// QR (secret=… )'}
              />
              {meta?.hasTotpSecret && (
                <p className="mt-1 text-xs text-ink-muted">Es ist bereits ein TOTP-Seed gespeichert. Leer lassen, um ihn zu behalten.</p>
              )}
            </label>

            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              Hinweis: Passwort und Seed werden in der Datenbank im Klartext in den Hotel-Einstellungen gespeichert (interner Betrieb).
              Zugriff auf diese Seite haben nur Konten mit Admin-Rolle.
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
                <span className="text-sm text-rose-700">{(saveMut.error as Error).message}</span>
              )}
              {saveMut.isSuccess && !saveMut.isPending && (
                <span className="text-sm text-emerald-800">Gespeichert.</span>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
