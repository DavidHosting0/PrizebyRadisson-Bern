import Link from 'next/link';

export const metadata = {
  title: 'Chrome Extension installieren · Housekeeping',
};

export default function ExtensionInstallPage() {
  return (
    <div className="mx-auto max-w-lg space-y-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">PrizeBern Panel installieren</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Die Chrome Extension zeigt Schichtübergabe und weitere Funktionen als Sidepanel auf jeder Website.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">1. Extension herunterladen</h2>
        <p className="text-sm text-ink-muted">
          Lade die ZIP-Datei herunter (auch in deinem Profil unter „Chrome Extension herunterladen“).
        </p>
        <a
          href="/downloads/prize-panel-extension.zip"
          download="prize-panel-extension.zip"
          className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-action px-4 text-sm font-medium text-white transition hover:bg-action/90"
        >
          Extension herunterladen (.zip)
        </a>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">2. In Chrome installieren</h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-ink-muted">
          <li>ZIP-Datei entpacken (Rechtsklick → „Alle extrahieren…“)</li>
          <li>
            Öffne <strong className="text-ink">chrome://extensions</strong>
          </li>
          <li>
            Aktiviere oben rechts <strong className="text-ink">Entwicklermodus</strong>
          </li>
          <li>
            Klicke <strong className="text-ink">Entpackte Erweiterung laden</strong> und wähle den
            entpackten Ordner <code className="text-ink">dist</code> (oder den Ordner mit{' '}
            <code className="text-ink">manifest.json</code>)
          </li>
        </ol>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">3. Anmelden</h2>
        <p className="text-sm text-ink-muted">
          Auf jeder Website erscheint rechts ein blauer Tab. Klicke darauf, melde dich mit denselben
          Zugangsdaten wie auf PrizeBern an — die Schichtübergabe ist dann direkt verfügbar.
        </p>
      </section>

      <Link href="/login" className="inline-block text-sm font-medium text-ink underline underline-offset-2">
        Zur Anmeldung
      </Link>
    </div>
  );
}
