import Link from 'next/link';

export const metadata = {
  title: 'App installieren · Housekeeping',
};

export default function InstallHelpPage() {
  return (
    <div className="mx-auto max-w-lg space-y-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">App auf dem Handy installieren</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Die Housekeeping-App läuft im Browser und kann wie eine native App auf den Home-Bildschirm gelegt werden.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Voraussetzung (IT / Admin)</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-ink-muted">
          <li>Die App muss über <strong className="text-ink">HTTPS</strong> erreichbar sein (z. B. https://ihre-domain.ch)</li>
          <li>
            <code className="rounded bg-surface-muted px-1 text-xs">WEB_ORIGIN</code> und{' '}
            <code className="rounded bg-surface-muted px-1 text-xs">NEXT_PUBLIC_API_URL</code> müssen zur Domain passen
          </li>
          <li>Nach Änderungen an der Web-App: <code className="text-xs">npm run build -w @housekeeping/web</code> und PM2
            neu starten
          </li>
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">iPhone (Safari)</h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-ink-muted">
          <li>Öffnen Sie die Anmeldeseite und melden Sie sich an</li>
          <li>Tippen Sie auf <strong className="text-ink">Teilen</strong> (Quadrat mit Pfeil)</li>
          <li>Wählen Sie <strong className="text-ink">Zum Home-Bildschirm</strong></li>
          <li>Bestätigen Sie — das Symbol „Housekeeping“ erscheint auf dem Home-Bildschirm</li>
        </ol>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Android (Chrome)</h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-ink-muted">
          <li>Öffnen Sie die Anmeldeseite in Chrome</li>
          <li>Tippen Sie auf <strong className="text-ink">App installieren</strong> (Banner oder Menü ⋮)</li>
          <li>Alternativ: Menü → <strong className="text-ink">Zum Startbildschirm hinzufügen</strong></li>
        </ol>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Nach der Installation</h2>
        <ul className="space-y-2 text-sm text-ink-muted">
          <li>
            <strong className="text-ink">Housekeeping:</strong> Zimmer, Anfragen, Chat
          </li>
          <li>
            <strong className="text-ink">Technik:</strong> Wartung, Zimmer, Chat
          </li>
          <li>
            <strong className="text-ink">Supervisor / Reception:</strong> Einmal „Mobile view“ wählen, dann bleibt die
            mobile Oberfläche gespeichert
          </li>
        </ul>
      </section>

      <Link href="/login" className="inline-block text-sm font-medium text-ink underline underline-offset-2">
        Zur Anmeldung
      </Link>
    </div>
  );
}
