import Link from 'next/link';
import { extensionDownloadUrl } from '@/lib/extension-download';

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
        <h2 className="text-sm font-semibold text-ink">Empfohlen: Chrome Web Store</h2>
        <p className="text-sm text-ink-muted">
          Sobald die Extension im Chrome Web Store veröffentlicht ist, installierst du sie dort —
          Updates kommen dann automatisch. Den Store-Link findest du hier, sobald er freigeschaltet
          ist.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Manuell (ZIP / Entwickler)</h2>
        <p className="text-sm text-ink-muted">
          Lade die ZIP-Datei herunter (auch im Profil unter „Chrome Extension herunterladen“).
        </p>
        <a
          href={extensionDownloadUrl()}
          download="prize-panel-extension.zip"
          className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-action px-4 text-sm font-medium text-white transition hover:bg-action/90"
        >
          Extension herunterladen (.zip)
        </a>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-ink-muted">
          <li>ZIP entpacken</li>
          <li>
            Öffne <strong className="text-ink">chrome://extensions</strong>
          </li>
          <li>
            Aktiviere <strong className="text-ink">Entwicklermodus</strong>
          </li>
          <li>
            <strong className="text-ink">Entpackte Erweiterung laden</strong> → Ordner mit{' '}
            <code className="text-ink">manifest.json</code>
          </li>
        </ol>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Anmelden</h2>
        <p className="text-sm text-ink-muted">
          Rechts erscheint das PrizeBern-Panel. Melde dich mit denselben Zugangsdaten wie auf der
          Website an.
        </p>
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/login" className="font-medium text-ink underline underline-offset-2">
          Zur Anmeldung
        </Link>
        <Link href="/extension-privacy" className="font-medium text-ink-muted underline underline-offset-2">
          Datenschutz Extension
        </Link>
      </div>
    </div>
  );
}
