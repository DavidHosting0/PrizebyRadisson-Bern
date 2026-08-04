import Link from 'next/link';

export const metadata = {
  title: 'Datenschutz · PrizeBern Panel Extension',
};

export default function ExtensionPrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Datenschutz — PrizeBern Panel
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Chrome Extension für Prize by Radisson Bern Housekeeping. Stand: August 2026.
        </p>
      </div>

      <section className="space-y-2 text-sm text-ink-muted">
        <h2 className="text-base font-semibold text-ink">Verantwortlicher</h2>
        <p>
          Prize by Radisson Bern — die Extension verbindet sich mit dem Housekeeping-Backend unter{' '}
          <a className="font-medium text-action underline" href="https://prizebern.com">
            prizebern.com
          </a>
          .
        </p>
      </section>

      <section className="space-y-2 text-sm text-ink-muted">
        <h2 className="text-base font-semibold text-ink">Welche Daten werden verarbeitet?</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong className="text-ink">Login:</strong> E-Mail und Passwort werden nur zur Anmeldung an
            die PrizeBern-API gesendet (gleiche Zugangsdaten wie die Website).
          </li>
          <li>
            <strong className="text-ink">Tokens:</strong> Access- und Refresh-Token werden lokal in{' '}
            <code className="text-ink">chrome.storage.local</code> gespeichert, damit die Session
            bestehen bleibt.
          </li>
          <li>
            <strong className="text-ink">Schichtübergabe:</strong> Checklisten-Status wird über die
            PrizeBern-API gelesen und aktualisiert.
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm text-ink-muted">
        <h2 className="text-base font-semibold text-ink">Was wird nicht getan?</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>Kein Tracking des Browserverlaufs und kein Auslesen fremder Website-Inhalte.</li>
          <li>Kein Verkauf von Daten an Dritte.</li>
          <li>
            Das Content Script zeigt nur das PrizeBern-Panel an; es liest keine Passwörter oder Formulare
            anderer Seiten.
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm text-ink-muted">
        <h2 className="text-base font-semibold text-ink">Berechtigungen</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong className="text-ink">storage:</strong> speichert Login-Tokens und Panel-Einstellungen.
          </li>
          <li>
            <strong className="text-ink">Host prizebern.com:</strong> API-Aufrufe für Login und
            Schichtübergabe.
          </li>
          <li>
            <strong className="text-ink">Alle Websites (Panel-Overlay):</strong> damit das Panel auf jeder
            Seite sichtbar ist, die Mitarbeitende bei der Arbeit nutzen (PMS, Intranet, etc.).
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm text-ink-muted">
        <h2 className="text-base font-semibold text-ink">Speicherdauer &amp; Löschung</h2>
        <p>
          Tokens bleiben auf dem Gerät, bis du dich in der Extension abmeldest oder die Extension
          deinstallierst. Server-seitig gelten die gleichen Regeln wie für die PrizeBern-Webapp.
        </p>
      </section>

      <section className="space-y-2 text-sm text-ink-muted">
        <h2 className="text-base font-semibold text-ink">Kontakt</h2>
        <p>
          Fragen zum Datenschutz: über die PrizeBern-Administration bzw. den Hotel-IT-Ansprechpartner.
        </p>
      </section>

      <Link href="/extension-install" className="inline-block text-sm font-medium text-ink underline underline-offset-2">
        Zurück zur Installationshilfe
      </Link>
    </div>
  );
}
