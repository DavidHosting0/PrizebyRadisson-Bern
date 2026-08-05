'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type AiConfigMeta = {
  hasOpenaiApiKey: boolean;
  openaiModel: string;
};

type SavePayload = {
  openaiApiKey?: string;
  openaiModel?: string;
};

export default function AdminAiConfigPage() {
  const queryClient = useQueryClient();
  const metaQuery = useQuery({
    queryKey: ['settings', 'ai-config'],
    queryFn: () => api<AiConfigMeta>('/settings/ai-config'),
  });

  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');

  useEffect(() => {
    if (metaQuery.data && !metaQuery.isFetching) {
      setOpenaiModel(metaQuery.data.openaiModel ?? '');
    }
  }, [metaQuery.data, metaQuery.isFetching]);

  const saveMut = useMutation({
    mutationFn: (body: SavePayload) =>
      api<AiConfigMeta>('/settings/ai-config', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['settings', 'ai-config'], next);
      setOpenaiApiKey('');
    },
  });

  const meta = metaQuery.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="AI Config"
        description="OpenAI-API-Key und Modell für die automatische Ticket-Analyse in Puzzel. Nur Admins haben Zugriff auf diese Seite."
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
              const body: SavePayload = {};
              if (openaiApiKey.trim().length > 0) {
                body.openaiApiKey = openaiApiKey.trim();
              }
              if (openaiModel.trim() !== (meta?.openaiModel ?? '')) {
                body.openaiModel = openaiModel.trim();
              }
              if (Object.keys(body).length === 0) return;
              saveMut.mutate(body);
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                OpenAI API Key
              </span>
              <input
                type="password"
                autoComplete="off"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                className={APP_DARK_INPUT + ' w-full py-2 font-mono'}
                placeholder={
                  meta?.hasOpenaiApiKey
                    ? 'Neu eintragen zum Ersetzen …'
                    : 'sk-…'
                }
              />
              {meta?.hasOpenaiApiKey && (
                <p className="mt-1 text-xs text-sidebar-muted">
                  Es ist bereits ein OpenAI-Key gespeichert. Leer lassen, um ihn zu
                  behalten.
                </p>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                Modell
              </span>
              <input
                type="text"
                autoComplete="off"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                className={APP_DARK_INPUT + ' w-full py-2 font-mono'}
                placeholder="gpt-4o-mini"
              />
              <p className="mt-1 text-xs text-sidebar-muted">
                Standard: <code>gpt-4o-mini</code> (schnell und günstig). Für mehr
                Qualität <code>gpt-4o</code>; für längere Tickets eignet sich
                ggf. <code>gpt-4.1-mini</code>.
              </p>
            </label>

            <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-200">
              Der Key wird mit AES-256-GCM verschlüsselt gespeichert (Schlüssel:{' '}
              <code>FAVUR_ENCRYPTION_KEY</code> auf dem Server). Diese Seite gibt
              ihn nie wieder im Klartext aus.
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
        <h2 className="text-lg font-semibold text-white">Verwendung</h2>
        <p className="mt-1 text-sm text-sidebar-muted">
          Aktuell wird die KI für die automatische Ticket-Analyse im{' '}
          <strong className="text-white">Puzzel-Modul</strong> genutzt. Wenn eine Rezeptionistin auf
          ein Ticket klickt, wird der Inhalt einmal an OpenAI geschickt; die
          Antwort wird in der Datenbank zwischengespeichert und nur dann erneut
          erzeugt, wenn neue Nachrichten zum Ticket hinzukommen.
        </p>
        <p className="mt-2 text-sm text-sidebar-muted">
          Team-Chat-Nachrichten werden ebenfalls über OpenAI übersetzt, wenn ein
          API-Schlüssel konfiguriert ist. Übersetzungen werden in der Datenbank
          zwischengespeichert.
        </p>
        <p className="mt-2 text-sm text-sidebar-muted">
          Kostenrahmen: <code>gpt-4o-mini</code> liegt bei ~0.15&nbsp;$ pro
          Million Input-Tokens und ~0.60&nbsp;$ pro Million Output-Tokens. Ein
          typisches Puzzel-Ticket kostet damit unter 0.001&nbsp;$ pro Analyse.
        </p>
      </section>
        </div>
      </AppPageBody>
    </div>
  );
}
