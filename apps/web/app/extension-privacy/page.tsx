import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Datenschutz · PrizeBern Panel Extension',
  description:
    'Datenschutzerklärung der Chrome Extension PrizeBern Panel für Prize by Radisson Bern Housekeeping.',
  robots: { index: true, follow: true },
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 space-y-3 text-sm leading-relaxed text-sidebar-muted">
      <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
      {children}
    </section>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-200">{children}</strong>;
}

export default function ExtensionPrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 px-6 py-12 text-sidebar-muted">
      <header className="space-y-3 border-b border-sidebar-border pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-sidebar-muted">
          Chrome Extension
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Datenschutzerklärung — PrizeBern Panel
        </h1>
        <p className="text-sm leading-relaxed text-sidebar-muted">
          Diese Erklärung gilt für die Browser-Extension «PrizeBern Panel» (Chrome / Chromium). Sie
          ergänzt die Nutzung der Housekeeping-Plattform unter{' '}
          <a
            className="font-medium text-sky-300/90 underline underline-offset-2 hover:text-sky-200"
            href="https://prizebern.com"
          >
            prizebern.com
          </a>
          . Stand: 10. September 2026.
        </p>
      </header>

      <nav
        aria-label="Inhalt"
        className="rounded-xl border border-sidebar-border bg-white/[0.03] px-4 py-3"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Inhalt</p>
        <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
          {[
            ['zweck', 'Zweck der Extension'],
            ['verantwortlicher', 'Verantwortlicher'],
            ['daten', 'Welche Daten'],
            ['nicht', 'Was wir nicht tun'],
            ['zwecke-verarbeitung', 'Zwecke der Verarbeitung'],
            ['speicher', 'Speicherung & Löschung'],
            ['rechte', 'Ihre Rechte'],
            ['berechtigungen', 'Chrome-Berechtigungen'],
            ['weitergabe', 'Weitergabe'],
            ['kontakt', 'Kontakt'],
          ].map(([hash, label]) => (
            <li key={hash}>
              <a
                className="text-sky-300/90 underline-offset-2 hover:text-sky-200 hover:underline"
                href={`#${hash}`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="zweck" title="1. Zweck der Extension">
        <p>
          PrizeBern Panel ist die Begleit-Extension für Mitarbeitende von Prize by Radisson Bern. Sie
          zeigt ein einklappbares Seitenpanel auf http(s)-Websites, damit Team-Chat, To-dos /
          Schichtübergabe, Schichtnotizen, Gästebeschwerden, Leihartikel und BernTicket-Aktivierungscodes
          während der Arbeit in anderen Systemen (z.&nbsp;B. PMS/EMMA, E-Mail) erreichbar bleiben.
        </p>
      </Section>

      <Section id="verantwortlicher" title="2. Verantwortlicher">
        <p>
          Verantwortlich für die Verarbeitung im Zusammenhang mit dieser Extension ist der Betrieb der
          PrizeBern-Housekeeping-Plattform (Prize by Radisson Bern) unter{' '}
          <a
            className="font-medium text-sky-300/90 underline underline-offset-2 hover:text-sky-200"
            href="https://prizebern.com"
          >
            https://prizebern.com
          </a>
          .
        </p>
        <p>
          Die Extension ist ein Client für dieselbe Backend-API wie die Webanwendung. Server-seitige
          Verarbeitung (Konten, Chat, Checklisten usw.) folgt denselben betrieblichen Regeln wie die
          Website.
        </p>
      </Section>

      <Section id="daten" title="3. Welche personenbezogenen Daten werden verarbeitet?">
        <p>Die Extension verarbeitet bzw. übermittelt insbesondere:</p>
        <ul className="list-outside list-disc space-y-2 pl-5 marker:text-sidebar-muted">
          <li>
            <Strong>Personenbezogene Angaben (Konto):</Strong> Name und E-Mail-Adresse des
            angemeldeten PrizeBern-Kontos (Anzeige im Panel, API-Antworten).
          </li>
          <li>
            <Strong>Authentifizierungsdaten (PrizeBern):</Strong> E-Mail und Passwort werden
            ausschliesslich zur Anmeldung an die PrizeBern-API gesendet (gleiche Zugangsdaten wie auf
            der Website). Access- und Refresh-Token werden lokal in{' '}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-[12px] text-slate-300">
              chrome.storage.local
            </code>{' '}
            gespeichert.
          </li>
          <li>
            <Strong>Authentifizierungsdaten (BernTicket):</Strong> Separater Login bei{' '}
            <a
              className="font-medium text-sky-300/90 underline underline-offset-2 hover:text-sky-200"
              href="https://bernticket.com"
            >
              bernticket.com
            </a>{' '}
            (eigenes Konto). Tokens werden getrennt von PrizeBern lokal gespeichert und nur an die
            BernTicket-API gesendet.
          </li>
          <li>
            <Strong>Persönliche Kommunikation:</Strong> Inhalte des Team-Chats (Nachrichten und
            optionale Anhänge/Fotos), sofern die Funktion genutzt wird und das Konto berechtigt ist.
          </li>
          <li>
            <Strong>Betriebs-/Housekeeping-Inhalte:</Strong> To-do- und Schichtübergabe-Status,
            Schichtnotizen, Gästebeschwerden und Leihartikel — jeweils über die PrizeBern-API und nur
            im Rahmen der Rollen-/Rechte des Kontos.
          </li>
          <li>
            <Strong>BernTicket / Aktivierungscodes:</Strong> Buchungsnummer, Gastname, Gültigkeit und
            Aktivierungscode werden über die BernTicket-API gelesen bzw. erstellt (Panel und EMMA
            Check-in-Toolbar). Auf EMMA-Seiten wird nur die Buchungsnummer (und hilfsweise sichtbare
            Gast-/Datumsfelder für die Ticket-Erstellung) verwendet — kein Auslesen von Passwörtern
            oder anderen Formularen.
          </li>
          <li>
            <Strong>Lokale Einstellungen:</Strong> z.&nbsp;B. eingeklappter Panel-Zustand und die
            API-Basis-URL (nur{' '}
            <code className="rounded bg-white/5 px-1 py-0.5 text-[12px] text-slate-300">
              https://prizebern.com/…
            </code>{' '}
            oder lokale Entwicklung unter localhost).
          </li>
        </ul>
        <p className="mt-3">
          Es werden <Strong>keine</Strong> Gesundheitsdaten, Zahlungsdaten, Standortdaten oder
          Browserverlaufsdaten durch die Extension erhoben. Fremde Website-Inhalte werden nicht
          systematisch ausgelesen oder an PrizeBern übermittelt.
        </p>
      </Section>

      <Section id="nicht" title="4. Was die Extension nicht tut">
        <ul className="list-outside list-disc space-y-2 pl-5 marker:text-sidebar-muted">
          <li>Kein Tracking des Browserverlaufs und keine Analyse besuchter Seiten.</li>
          <li>
            Kein Auslesen von Passwörtern oder Formularinhalten anderer Websites — das Content Script
            zeigt das PrizeBern-Panel, optional Chat-Hinweise, und auf EMMA-Check-in die BernTicket-
            Toolbar-Hilfe (Buchungsnr. / Ticket-Erstellung).
          </li>
          <li>Kein Verkauf von Daten, keine Werbung, kein Profiling für Marketing.</li>
          <li>
            Keine Analyse-, Werbe- oder Crash-SDKs von Drittanbietern in der Extension; kein Nachladen
            von Remote-Code.
          </li>
        </ul>
      </Section>

      <Section id="zwecke-verarbeitung" title="5. Zwecke der Verarbeitung">
        <ul className="list-outside list-disc space-y-2 pl-5 marker:text-sidebar-muted">
          <li>Anmeldung und Aufrechterhaltung der Sitzung bei PrizeBern</li>
          <li>Bereitstellung der Housekeeping-Funktionen im Sidepanel</li>
          <li>Teamkommunikation (Chat) für den Hotelbetrieb</li>
          <li>BernTicket-Aktivierungscodes suchen, anzeigen und erstellen (bernticket.com)</li>
          <li>Technische Funktionsfähigkeit (lokale Panel-Einstellungen)</li>
        </ul>
        <p>
          Die Verarbeitung erfolgt für den internen Hotel-/Betriebszweck der PrizeBern-Plattform und
          nur für berechtigte Mitarbeitende mit PrizeBern-Konto.
        </p>
      </Section>

      <Section id="speicher" title="6. Speicherung, Übermittlung und Löschung">
        <ul className="list-outside list-disc space-y-2 pl-5 marker:text-sidebar-muted">
          <li>
            <Strong>Gerät:</Strong> PrizeBern- und BernTicket-Tokens sowie Panel-Einstellungen liegen
            lokal in Chrome Storage, bis Sie sich abmelden oder die Extension deinstallieren.
          </li>
          <li>
            <Strong>Server:</Strong> PrizeBern-Daten gehen an <Strong>https://prizebern.com</Strong>.
            BernTicket-Login und Tickets gehen an <Strong>https://bernticket.com</Strong>. Speicherdauer
            folgt den jeweiligen Plattformen und den betrieblichen Vorgaben des Hotels.
          </li>
          <li>
            <Strong>Entwicklung:</Strong> Optional kann eine lokale API (
            <code className="rounded bg-white/5 px-1 py-0.5 text-[12px] text-slate-300">
              localhost:3001
            </code>
            ) konfiguriert werden — nur für Entwicklung, nicht für den Produktivbetrieb.
          </li>
        </ul>
      </Section>

      <Section id="rechte" title="7. Ihre Rechte">
        <p>
          Soweit anwendbar (z.&nbsp;B. DSG/DSGVO), können betroffene Personen Auskunft, Berichtigung,
          Löschung, Einschränkung der Verarbeitung sowie — wo vorgesehen — Datenübertragbarkeit und
          Widerspruch verlangen. Für Anliegen zu Konto- und Serverdaten wenden Sie sich an die
          PrizeBern-Administration bzw. den Hotel-IT-/Datenschutz-Ansprechpartner.
        </p>
        <p>
          Lokal gespeicherte Extension-Daten können Sie jederzeit durch Abmelden oder Deinstallieren der
          Extension entfernen.
        </p>
      </Section>

      <Section id="berechtigungen" title="8. Chrome-Berechtigungen">
        <ul className="list-outside list-disc space-y-2 pl-5 marker:text-sidebar-muted">
          <li>
            <Strong>storage:</Strong> lokale Speicherung von PrizeBern- und BernTicket-Tokens sowie
            Panel-Einstellungen.
          </li>
          <li>
            <Strong>https://prizebern.com/*:</Strong> API-Aufrufe für Login und
            Housekeeping-Funktionen.
          </li>
          <li>
            <Strong>https://bernticket.com/*:</Strong> API-Aufrufe für BernTicket-Login und
            Aktivierungscodes (suchen, erstellen, bearbeiten).
          </li>
          <li>
            <Strong>http://*/* und https://*/* (Content Script):</Strong> PrizeBern-Panel-Overlay und
            auf EMMA-Check-in die BernTicket-Toolbar (Buchungsnr. / Ticket). Kein Scraping von
            Passwörtern oder fremden Formularen.
          </li>
          <li>
            <Strong>Optional localhost:</Strong> nur für lokale PrizeBern-Entwicklung.
          </li>
        </ul>
      </Section>

      <Section id="weitergabe" title="9. Weitergabe an Dritte">
        <p>
          Die Extension verkauft keine Daten und gibt keine Nutzerdaten an Werbenetzwerke oder
          Datenbroker weiter. Übermittlungen erfolgen an prizebern.com und — bei Nutzung von
          BernTicket — an bernticket.com zur Erfüllung der oben genannten Zwecke. Allfällige
          Auftragsverarbeiter richten sich nach der Konfiguration dieser Plattformen — nicht nach
          zusätzlichen Extension-SDKs.
        </p>
      </Section>

      <Section id="kontakt" title="10. Kontakt">
        <p>
          Fragen zu dieser Datenschutzerklärung oder zur Extension:{' '}
          <Strong>PrizeBern-Administration</Strong> bzw. den{' '}
          <Strong>Hotel-IT- / Datenschutz-Ansprechpartner</Strong> von Prize by Radisson Bern.
        </p>
        <p>
          Installationshilfe:{' '}
          <Link
            href="/extension-install"
            className="font-medium text-sky-300/90 underline underline-offset-2 hover:text-sky-200"
          >
            prizebern.com/extension-install
          </Link>
        </p>
      </Section>

      <footer className="flex flex-wrap gap-4 border-t border-sidebar-border pt-6 text-sm">
        <Link
          href="/extension-install"
          className="font-medium text-slate-200 underline underline-offset-2 hover:text-white"
        >
          Zur Installationshilfe
        </Link>
        <a
          href="https://prizebern.com"
          className="font-medium text-sidebar-muted underline underline-offset-2 hover:text-slate-300"
        >
          Zur Website
        </a>
      </footer>
    </div>
  );
}
