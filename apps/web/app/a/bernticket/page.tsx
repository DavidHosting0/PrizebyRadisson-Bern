'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type BernTicketMeta = {
  email: string | null;
  hasPassword: boolean;
};

export default function AdminBernTicketCredentialsPage() {
  const queryClient = useQueryClient();
  const metaQuery = useQuery({
    queryKey: ['settings', 'bernticket-login'],
    queryFn: () => api<BernTicketMeta>('/settings/bernticket-login'),
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (metaQuery.data && !metaQuery.isFetching) {
      setEmail(metaQuery.data.email ?? '');
    }
  }, [metaQuery.data, metaQuery.isFetching]);

  const saveMut = useMutation({
    mutationFn: (body: { email: string; password?: string }) =>
      api<BernTicketMeta>('/settings/bernticket-login', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings', 'bernticket-login'], next);
      setPassword('');
    },
  });

  const meta = metaQuery.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="BernTicket"
        description="Admin-Konto für die automatische BernTicket-Erstellung beim Anreise-Check. Nur sichtbar für Administratoren."
        actions={<AppChromeTools />}
      />
      <AppPageBody>
        <div className="space-y-8 p-4 md:p-6">
          <section className={APP_DARK_CARD + ' p-5'}>
            {metaQuery.isLoading ? (
              <p className="text-sm text-sidebar-muted">Lädt…</p>
            ) : (
              <form
                className="grid max-w-xl grid-cols-1 gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body: { email: string; password?: string } = {
                    email: email.trim(),
                  };
                  if (password.trim().length > 0) {
                    body.password = password;
                  }
                  saveMut.mutate(body);
                }}
              >
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                    E-Mail (bernticket.com)
                  </span>
                  <input
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={clsx(APP_DARK_INPUT, 'w-full py-2')}
                    placeholder="name@firma.com"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                    Passwort
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={clsx(APP_DARK_INPUT, 'w-full py-2')}
                    placeholder={meta?.hasPassword ? 'Neu eintragen zum Ersetzen …' : 'Passwort'}
                  />
                  {meta?.hasPassword && (
                    <p className="mt-1 text-xs text-sidebar-muted">
                      Es ist bereits ein Passwort gespeichert. Leer lassen, um es zu behalten.
                    </p>
                  )}
                </label>

                <p className="rounded-lg border border-sky-400/30 bg-sky-400/10 p-3 text-xs text-sky-100">
                  Dieses Konto wird beim Anreise-Check für alle Buchungen verwendet. Das Passwort wird
                  verschlüsselt gespeichert. 2FA beim Erstellen wird als BernTicket-Fehler markiert und
                  blockiert den Anreise-Check nicht.
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
                    <span className="text-sm text-rose-400">{(saveMut.error as Error).message}</span>
                  )}
                  {saveMut.isSuccess && !saveMut.isPending && (
                    <span className="text-sm text-emerald-400">Gespeichert.</span>
                  )}
                </div>
              </form>
            )}
          </section>
        </div>
      </AppPageBody>
    </div>
  );
}
