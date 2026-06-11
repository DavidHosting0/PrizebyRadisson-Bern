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
        <h2 className="text-sm font-semibold text-ink">iPhone (Safari)</h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-ink-muted">
          <li>Öffne die Anmeldeseite und melde dich an</li>
          <li>Tippe auf <strong className="text-ink">Teilen</strong> (Quadrat mit Pfeil)</li>
          <li>Wähle <strong className="text-ink">Zum Home-Bildschirm</strong></li>
          <li>Bestätige — das Symbol „Housekeeping“ erscheint auf dem Home-Bildschirm</li>
        </ol>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Android (Chrome)</h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-ink-muted">
          <li>Öffne die Anmeldeseite in Chrome</li>
          <li>Tippe auf <strong className="text-ink">App installieren</strong> (Banner oder Menü ⋮)</li>
          <li>Alternativ: Menü → <strong className="text-ink">Zum Startbildschirm hinzufügen</strong></li>
        </ol>
      </section>

      <Link href="/login" className="inline-block text-sm font-medium text-ink underline underline-offset-2">
        Zur Anmeldung
      </Link>
    </div>
  );
}
