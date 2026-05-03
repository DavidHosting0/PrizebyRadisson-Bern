import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { PuzzelTicket, PuzzelTicketMessage } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';

export type PuzzelTicketPrizeCategory =
  | 'SPAM'
  | 'RECHNUNG_ANGEFRAGT'
  | 'RECHNUNGSKORREKTUR'
  | 'MEHRERE_RECHNUNGSANFRAGEN'
  | 'SONSTIGES';

/**
 * Possible high-level intents we expect on a Puzzel ticket.
 *
 * Puzzel is used by Prize by Radisson Bern City *primarily* for invoice/billing
 * issues; `prizeCategory` captures Spam and multi-request cases explicitly.
 */
export type PuzzelTicketRequestType =
  | 'invoice_correction'
  | 'invoice_resend'
  | 'invoice_other'
  | 'unknown';

export type PuzzelTicketBookingDetails = {
  reservationNumber: string | null;
  roomNumber: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  guestName: string | null;
  invoiceNumber: string | null;
  /** OTA or channel (e.g. Booking.com, Expedia, direct, corporate travel). */
  bookingPlatform: string | null;
  /** Free-form extras the AI thought worth surfacing (e.g. VAT requests). */
  otherDetails: string[];
};

/**
 * What the guest actually needs regarding the invoice (finer than requestType).
 * Must stay consistent with `requestType` per the system-prompt rules.
 */
export type PuzzelInvoiceAction =
  | 'resend_only'
  | 'correct_and_reissue'
  | 'new_or_additional_invoice'
  | 'vat_tax_legal'
  | 'payment_refund'
  | 'invoice_question'
  | 'other_billing'
  | 'unclear';

export type PuzzelTicketUrgency = 'critical' | 'high' | 'normal' | 'low';

/**
 * Whether the requester wants company / full billing details printed on the invoice,
 * and which parts they asked for (Firmenname, Straße, Hausnummer, PLZ, Ort, Land, USt/VAT).
 */
export type CompanyBillingOnInvoiceIntent = 'yes' | 'no' | 'unclear' | 'not_mentioned';

export type CompanyInvoiceBillingDetails = {
  intent: CompanyBillingOnInvoiceIntent;
  /** True when the guest explicitly asked for this element to appear (or be corrected) on the invoice. */
  fieldsRequestedOnInvoice: {
    companyName: boolean;
    street: boolean;
    houseNumber: boolean;
    postalCode: boolean;
    city: boolean;
    country: boolean;
    vatNumber: boolean;
  };
  /** Verbatim from the ticket when stated; otherwise null. */
  extracted: {
    companyName: string | null;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    vatNumber: string | null;
  };
};

export function defaultCompanyInvoiceBillingDetails(): CompanyInvoiceBillingDetails {
  return {
    intent: 'not_mentioned',
    fieldsRequestedOnInvoice: {
      companyName: false,
      street: false,
      houseNumber: false,
      postalCode: false,
      city: false,
      country: false,
      vatNumber: false,
    },
    extracted: {
      companyName: null,
      street: null,
      houseNumber: null,
      postalCode: null,
      city: null,
      country: null,
      vatNumber: null,
    },
  };
}

/** When stored analysis rows lack company billing extraction. */
export function mergeCompanyInvoiceBillingDetails(
  raw: unknown,
): CompanyInvoiceBillingDetails {
  const base = defaultCompanyInvoiceBillingDetails();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const intent =
    o.intent === 'yes' || o.intent === 'no' || o.intent === 'unclear' || o.intent === 'not_mentioned'
      ? o.intent
      : base.intent;
  const fr = o.fieldsRequestedOnInvoice;
  const fields =
    fr && typeof fr === 'object'
      ? (fr as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const ex = o.extracted;
  const ext = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {};

  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const ns = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };

  return {
    intent,
    fieldsRequestedOnInvoice: {
      companyName: bool(fields.companyName, base.fieldsRequestedOnInvoice.companyName),
      street: bool(fields.street, base.fieldsRequestedOnInvoice.street),
      houseNumber: bool(fields.houseNumber, base.fieldsRequestedOnInvoice.houseNumber),
      postalCode: bool(fields.postalCode, base.fieldsRequestedOnInvoice.postalCode),
      city: bool(fields.city, base.fieldsRequestedOnInvoice.city),
      country: bool(fields.country, base.fieldsRequestedOnInvoice.country),
      vatNumber: bool(fields.vatNumber, base.fieldsRequestedOnInvoice.vatNumber),
    },
    extracted: {
      companyName: ns(ext.companyName) ?? base.extracted.companyName,
      street: ns(ext.street) ?? base.extracted.street,
      houseNumber: ns(ext.houseNumber) ?? base.extracted.houseNumber,
      postalCode: ns(ext.postalCode) ?? base.extracted.postalCode,
      city: ns(ext.city) ?? base.extracted.city,
      country: ns(ext.country) ?? base.extracted.country,
      vatNumber: ns(ext.vatNumber) ?? base.extracted.vatNumber,
    },
  };
}

/** When stored analysis rows lack `invoiceAction`, infer from legacy `requestType`. */
export function defaultInvoiceActionForRequestType(
  requestType: PuzzelTicketRequestType,
): PuzzelInvoiceAction {
  const map: Record<PuzzelTicketRequestType, PuzzelInvoiceAction> = {
    invoice_resend: 'resend_only',
    invoice_correction: 'correct_and_reissue',
    invoice_other: 'other_billing',
    unknown: 'unclear',
  };
  return map[requestType];
}

export type PuzzelTicketAiAnalysis = {
  prizeCategory: PuzzelTicketPrizeCategory;
  requestType: PuzzelTicketRequestType;
  /**
   * Structured invoice intent: send-only vs fix-content vs payment etc.
   * Distinct from requestType labels — use for routing and agent expectations.
   */
  invoiceAction: PuzzelInvoiceAction;
  /** Short human-readable issue label (German preferred if ticket is DE; English if EN). */
  issueTypeLabel: string;
  /** Operational urgency inferred from wording, deadlines, and tone (not the same as confidence). */
  urgencyLevel: PuzzelTicketUrgency;
  summary: string;
  bookingDetails: PuzzelTicketBookingDetails;
  /**
   * Firma / vollständige Rechnungsadresse auf der Rechnung (inkl. USt-IdNr.),
   * sofern der Gast das anfragt oder Daten liefert.
   */
  companyInvoiceBillingDetails: CompanyInvoiceBillingDetails;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
};

/** Bumps when AI JSON schema / semantics change so cached analyses are invalidated. */
export const PUZZEL_AI_ANALYSIS_SCHEMA_VERSION = 'v6';

/**
 * A SHA-256 fingerprint over the messages used as input to the AI. Used to
 * detect when an existing analysis is stale (new messages arrived) and to
 * cache results in `PuzzelTicketAnalysis.messagesFingerprint`.
 */
export function fingerprintMessages(
  ticket: Pick<PuzzelTicket, 'externalKey' | 'subject' | 'rowSummary'>,
  messages: Pick<
    PuzzelTicketMessage,
    'direction' | 'fromText' | 'sentAtText' | 'bodyText'
  >[],
): string {
  const hasher = createHash('sha256');
  hasher.update(`${PUZZEL_AI_ANALYSIS_SCHEMA_VERSION}\n`);
  hasher.update(`${ticket.externalKey}\n${ticket.subject}\n${ticket.rowSummary}\n`);
  for (const m of messages) {
    hasher.update(
      [
        m.direction ?? '',
        m.fromText ?? '',
        m.sentAtText ?? '',
        m.bodyText ?? '',
      ].join('|||'),
    );
    hasher.update('\n--MSG--\n');
  }
  return hasher.digest('hex');
}

const SYSTEM_PROMPT = `Du bist ein Hotel-Support-Assistent für "Prize by Radisson Bern City". Die Puzzel-Queue dient vor allem Rechnungs- und Buchhaltungsfällen, kann aber auch irrelevante oder Mehrfach-Anfragen enthalten — du sollst robust mit beliebigem unstrukturierten Text umgehen (copy-pastete E-Mails, Signaturen, mehrere Sprachen).

Sprachen: Die Ticket-Nachrichten können Deutsch und/oder Englisch sein. Antworte strukturiert im JSON-Schema; Freitext-Felder ("summary", "issueTypeLabel", "rationale") sollen in der Hauptsprache des Gastes/Anfragestellers formuliert sein — ist die Hauptsprache nicht erkennbar, nutze Deutsch.

Dein Job (Entity-Extraktion, NER-Stil):

0. "prizeCategory" — **genau eine** Kategorie für die PrizeBern-Ansicht:
   • "SPAM" — Thema hat **nichts mit Rechnungen** zu tun (z. B. Marketing, Bewertungsplattform, allgemeine Hotelanfrage ohne Rechnung, Off-Topic).
   • "RECHNUNG_ANGEFRAGT" — es geht **ausschließlich** um **Zusendung/Kopie** der Rechnung (PDF, E-Mail, Post), **ohne** dass der **Inhalt** des Belegs geändert werden muss.
   • "RECHNUNGSKORREKTUR" — **Inhalt** der Rechnung soll angepasst werden: Adresse, Firma, Betrag, Positionen, Zimmer/Gast, MwSt, Storno, neue Rechnung mit geänderten Daten.
   • "MEHRERE_RECHNUNGSANFRAGEN" — in **dieser einen** Puzzel-Anfrage werden **mehrere** klar getrennte Rechnungswünsche behandelt (z. B. mehrere Buchungen/Rechnungsnummern, mehrere Korrekturen, „bitte auch noch für Aufenthalt X …“).
   • "SONSTIGES" — offenbar **rechnungs-/buchhaltungsbezogen**, fällt aber nicht sauber unter ANGEFRAGT, KORREKTUR oder MEHRFACH (und ist nicht SPAM).

   **Vorrang:** Klar kein Rechnungsthema → "SPAM". Mehrere eigenständige Rechnungs-/Korrektur-Themen in einem Thread → "MEHRERE_RECHNUNGSANFRAGEN".
   Wenn "SPAM": setze "invoiceAction" auf "unclear" und "requestType" auf "unknown".

1. Lies alle Nachrichten chronologisch. Identifiziere Gast/Anfragesteller vs. Hotel-Antworten anhand der übergebenen Richtung (GAST → HOTEL / HOTEL → GAST).

2. "invoiceAction" — **was genau** bezüglich der Rechnung nötig ist (präzise wählen):
   • "resend_only" — nur erneut zusenden: PDF fehlt, E-Mail nicht angekommen, falsche Mailbox, Kopie — **ohne** dass der Rechnungs**inhalt** geändert werden muss
   • "correct_and_reissue" — Inhalt ist falsch und muss korrigiert/neu ausgestellt werden: Adresse/Firmenname, Betrag, Positionen, Zimmer/Gast, Storno, Doppelbuchung, falscher MWSt-Satz auf der Rechnung
   • "new_or_additional_invoice" — zusätzliche oder gesplittete Rechnung, Pro-forma, „zweite Rechnung“, Aufteilung Kosten — nicht nur „nochmal dieselbe schicken“
   • "vat_tax_legal" — USt-IdNr./VAT ID auf Rechnung, Steuerbescheinigung, Formular für Finanzamt, Reverse-Charge-Hinweis — oft Korrektur, kann aber nur Rückfrage sein
   • "payment_refund" — Zahlung, Rückerstattung, Chargeback, Lastschrift, Kartenabrechnung, „bereits bezahlt“
   • "invoice_question" — Rückfrage zu bestehender Rechnung (Zeilen, Datum) **ohne** klare Bitte um Korrektur oder erneuten Versand
   • "other_billing" — sonstiges Buchhaltungs-/Zahlungsthema (Skonto, Mahnung, SEPA, Bankdaten …), passt nicht in die obigen Kategorien
   • "unclear" — aus dem Text nicht eindeutig

   **Entscheidungshilfe (DE/EN-Signale):**
   - „Rechnung nochmal / PDF / nicht erhalten / resend / forward / duplicate email“ **und kein Hinweis auf falschen Betrag/Adresse** → "resend_only"
   - „falsche Adresse / wrong amount / korrigieren / Storno / MwSt / VAT / bitte neue Rechnung mit …“ → "correct_and_reissue" (außer es ist eindeutig nur Zahlungsstreit → "payment_refund")
   - „split invoice / separate bill / pro forma / zusätzliche Rechnung“ → "new_or_additional_invoice"

3. "requestType" — muss zur gewählten "invoiceAction" **passen** (bei SPAM immer "unknown"):
   • invoiceAction "resend_only" → requestType "invoice_resend"
   • invoiceAction "correct_and_reissue" oder "new_or_additional_invoice" oder "vat_tax_legal" → requestType "invoice_correction" **wenn** hauptsächlich Inhalt/Beleg geändert werden soll; wenn nur Steuer**frage** ohne Korrektur → "invoice_other"
   • invoiceAction "payment_refund" oder "invoice_question" oder "other_billing" → requestType "invoice_other"
   • invoiceAction "unclear" → requestType "unknown"

4. "issueTypeLabel" — eine kurze Benutzer-Label-Zeile (max. 80 Zeichen), die **konkret** sagt was fehlt (z. B. „PDF erneut an xy@…“, „Betrag Berichtigung Position Übernachtung“, „Firmenadresse auf Rechnung“). Keine technischen Enum-Namen.

5. "urgencyLevel" — geschätzte Dringlichkeit für die Bearbeitung:
   • "critical" — z. B. heute/ASAP, rechtliche Frist, Hotel noch vor Ort, massiver Fehler
   • "high" — enge Frist, wiederholte Nachfragen, klare Eskalation
   • "normal" — Standardfall
   • "low" — kein Zeitdruck erkennbar

6. "companyInvoiceBillingDetails" — will der **Anfragesteller**, dass die Rechnung **Firmen- bzw. vollständige Rechnungsdaten** enthält (nicht nur Privat/Person)?
   **intent** (genau eine):
   • "yes" — klar: Rechnung soll auf Firma / mit Firmenangaben / Geschäftsadresse / USt-IdNr. (UID, VAT ID, MWST-Nr.) ausgestellt oder korrigiert werden
     Signale DE: „auf die Firma“, „Firmenname auf Rechnung“, „Rechnungsadresse“, „USt-Id“, „MwSt-Nr.“, „buchhaltungsrelevant“
     Signale EN: „company details on invoice“, „business address“, „VAT number on the invoice“
   • "no" — eindeutig nur Privatperson / keine Firmenrechnung gewünscht, oder ausdrücklich keine solchen Angaben nötig
   • "unclear" — widersprüchlich oder zu wenig Kontext
   • "not_mentioned" — kein Bezug zu Firma vs. Privat oder Rechnungsadresse

   **fieldsRequestedOnInvoice**: pro Feld **true**, wenn der Gast **explizit** will, dass dieses Element **auf der Rechnung steht oder korrigiert wird** — sonst **false**:
   companyName (Firmenname), street (Straße), houseNumber (Hausnummer), postalCode (PLZ), city (Stadt/Ort), country (Land), vatNumber (USt-IdNr./VAT)

   **extracted**: nur wortgetreu aus dem Text; nichts erfinden; null wenn nicht genannt.
   Straße und Hausnummer trennen wenn im Text klar getrennt (z. B. „Musterstrasse 12a“ → street „Musterstrasse“, houseNumber „12a“); sonst ggf. volle Adresszeile in street und houseNumber null.

7. "bookingDetails": Extrahiere nur was im Text steht; sonst null (nicht raten). bookingPlatform: z. B. "Booking.com", "Expedia", "HRS", "Direct / Hotel", "Corporate", "OTA (sonstiges)", oder null wenn nicht erkennbar.

8. "summary" — **eine** prägnante Zeile (max. 140 Zeichen) für die Rezeption: was ist zu tun? Wenn Firmenrechnung/USt-Thema zentral ist, kurz erwähnen.

9. "rationale" — ein Absatz auf Deutsch oder Englisch (passend zur Hauptsprache des Tickets), der die Einordnung begründet; bei invoiceAction/Korrektur kurz sagen ob **Firmendaten auf Rechnung** relevant sind.

10. "confidence": "high" | "medium" | "low" — Qualität deiner Extraktion, nicht Dringlichkeit.

Regeln:
- Nichts erfinden. Unklare Felder = null.
- Zahlen, Namen, Buchungs- und Rechnungs-Referenzen wortgleich übernehmen.
- Datumsformate nicht normalisieren (so wie im Original).
- Signatur- und Disclaimer-Blöcke ignorieren, außer sie enthalten relevante Buchungsdaten.
- Antwort ausschließlich als gültiges JSON gemäß Schema.`;

const ANALYSIS_JSON_SCHEMA = {
  name: 'PuzzelTicketAnalysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      prizeCategory: {
        type: 'string',
        enum: [
          'SPAM',
          'RECHNUNG_ANGEFRAGT',
          'RECHNUNGSKORREKTUR',
          'MEHRERE_RECHNUNGSANFRAGEN',
          'SONSTIGES',
        ],
      },
      invoiceAction: {
        type: 'string',
        enum: [
          'resend_only',
          'correct_and_reissue',
          'new_or_additional_invoice',
          'vat_tax_legal',
          'payment_refund',
          'invoice_question',
          'other_billing',
          'unclear',
        ],
      },
      requestType: {
        type: 'string',
        enum: [
          'invoice_correction',
          'invoice_resend',
          'invoice_other',
          'unknown',
        ],
      },
      issueTypeLabel: { type: 'string' },
      urgencyLevel: {
        type: 'string',
        enum: ['critical', 'high', 'normal', 'low'],
      },
      summary: { type: 'string' },
      companyInvoiceBillingDetails: {
        type: 'object',
        additionalProperties: false,
        properties: {
          intent: {
            type: 'string',
            enum: ['yes', 'no', 'unclear', 'not_mentioned'],
          },
          fieldsRequestedOnInvoice: {
            type: 'object',
            additionalProperties: false,
            properties: {
              companyName: { type: 'boolean' },
              street: { type: 'boolean' },
              houseNumber: { type: 'boolean' },
              postalCode: { type: 'boolean' },
              city: { type: 'boolean' },
              country: { type: 'boolean' },
              vatNumber: { type: 'boolean' },
            },
            required: [
              'companyName',
              'street',
              'houseNumber',
              'postalCode',
              'city',
              'country',
              'vatNumber',
            ],
          },
          extracted: {
            type: 'object',
            additionalProperties: false,
            properties: {
              companyName: { type: ['string', 'null'] },
              street: { type: ['string', 'null'] },
              houseNumber: { type: ['string', 'null'] },
              postalCode: { type: ['string', 'null'] },
              city: { type: ['string', 'null'] },
              country: { type: ['string', 'null'] },
              vatNumber: { type: ['string', 'null'] },
            },
            required: [
              'companyName',
              'street',
              'houseNumber',
              'postalCode',
              'city',
              'country',
              'vatNumber',
            ],
          },
        },
        required: ['intent', 'fieldsRequestedOnInvoice', 'extracted'],
      },
      bookingDetails: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reservationNumber: { type: ['string', 'null'] },
          roomNumber: { type: ['string', 'null'] },
          checkInDate: { type: ['string', 'null'] },
          checkOutDate: { type: ['string', 'null'] },
          guestName: { type: ['string', 'null'] },
          invoiceNumber: { type: ['string', 'null'] },
          bookingPlatform: { type: ['string', 'null'] },
          otherDetails: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: [
          'reservationNumber',
          'roomNumber',
          'checkInDate',
          'checkOutDate',
          'guestName',
          'invoiceNumber',
          'bookingPlatform',
          'otherDetails',
        ],
      },
      rationale: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: [
      'prizeCategory',
      'invoiceAction',
      'requestType',
      'issueTypeLabel',
      'urgencyLevel',
      'summary',
      'companyInvoiceBillingDetails',
      'bookingDetails',
      'rationale',
      'confidence',
    ],
  },
} as const;

/** Trim long message bodies before shipping them to OpenAI. */
const MAX_BODY_CHARS = 8000;

@Injectable()
export class PuzzleAiService {
  private readonly log = new Logger(PuzzleAiService.name);

  constructor(private readonly settings: SettingsService) {}

  /**
   * Send the ticket + chronological messages to OpenAI and return a strongly
   * typed analysis. Throws if the API key is not configured or if the call
   * fails — the caller is expected to surface this to the receptionist.
   */
  async analyzeTicket(
    ticket: Pick<PuzzelTicket, 'externalKey' | 'subject' | 'reference' | 'rowSummary'>,
    messages: Pick<
      PuzzelTicketMessage,
      'direction' | 'fromText' | 'toText' | 'sentAtText' | 'bodyText'
    >[],
  ): Promise<{ analysis: PuzzelTicketAiAnalysis; model: string }> {
    const config = await this.settings.getAiConfigSecrets();
    if (!config?.openaiApiKey) {
      throw new Error(
        'OpenAI-API-Key ist nicht konfiguriert. Admin → Settings → AI Config.',
      );
    }
    const model = config.openaiModel || 'gpt-4o-mini';

    const userPrompt = this.buildUserPrompt(ticket, messages);
    this.log.log(
      `[PuzzleAI] Analyse Ticket ${ticket.reference ?? ticket.externalKey} (Modell ${model}, ${messages.length} Nachrichten)`,
    );

    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const chatMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const completion = await client.chat.completions.create({
      model,
      messages: chatMessages,
      // Structured output: the response is *guaranteed* to match the schema
      // when `strict: true`. Removes any JSON-parsing fragility.
      response_format: {
        type: 'json_schema',
        json_schema: ANALYSIS_JSON_SCHEMA,
      },
      temperature: 0.1,
    });

    const choice = completion.choices?.[0];
    const raw = choice?.message?.content;
    if (!raw) {
      throw new Error('OpenAI hat eine leere Antwort zurückgegeben.');
    }
    if (choice?.finish_reason && choice.finish_reason !== 'stop') {
      this.log.warn(
        `[PuzzleAI] Unerwartetes finish_reason="${choice.finish_reason}"`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `OpenAI hat kein gültiges JSON geliefert: ${(err as Error).message}`,
      );
    }
    return { analysis: this.coerceAnalysis(parsed), model };
  }

  private buildUserPrompt(
    ticket: Pick<PuzzelTicket, 'subject' | 'reference' | 'rowSummary'>,
    messages: Pick<
      PuzzelTicketMessage,
      'direction' | 'fromText' | 'toText' | 'sentAtText' | 'bodyText'
    >[],
  ): string {
    const parts: string[] = [];
    parts.push(`# Ticket-Header`);
    parts.push(`Referenz: ${ticket.reference ?? '(keine)'}`);
    parts.push(`Betreff: ${ticket.subject}`);
    parts.push(`Listen-Zusammenfassung (von Puzzel): ${ticket.rowSummary}`);
    parts.push('');
    parts.push(`# Nachrichten (chronologisch)`);
    if (messages.length === 0) {
      parts.push('(keine Nachrichten verfügbar — bitte versuche das Anliegen aus dem Header zu erfassen)');
    } else {
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const dir =
          m.direction === 'inbound'
            ? 'GAST → HOTEL'
            : m.direction === 'outbound'
              ? 'HOTEL → GAST'
              : 'UNKLAR';
        parts.push(`## Nachricht ${i + 1} (${dir})`);
        parts.push(`Von: ${m.fromText ?? '(unbekannt)'}`);
        parts.push(`An: ${m.toText ?? '(unbekannt)'}`);
        parts.push(`Gesendet: ${m.sentAtText ?? '(unbekannt)'}`);
        parts.push('');
        parts.push(this.truncate(m.bodyText ?? '', MAX_BODY_CHARS));
        parts.push('');
      }
    }
    return parts.join('\n');
  }

  private truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n\n[…gekürzt, ${text.length - max} Zeichen entfernt]`;
  }

  /**
   * Coerce the OpenAI response into our typed shape. Even with strict-mode
   * schema validation we keep this defensive for forward compatibility (e.g.
   * the model adds unknown enum values).
   */
  private coerceAnalysis(raw: unknown): PuzzelTicketAiAnalysis {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Unerwartetes AI-Antwortformat (kein Objekt).');
    }
    const o = raw as Record<string, unknown>;
    const prizeCategory = this.coercePrizeCategory(o.prizeCategory);
    const requestType = this.coerceRequestType(o.requestType);
    let invoiceAction = this.coerceInvoiceAction(o.invoiceAction, requestType);
    let req = requestType;
    if (prizeCategory === 'SPAM') {
      req = 'unknown';
      invoiceAction = 'unclear';
    }
    const issueTypeLabel =
      typeof o.issueTypeLabel === 'string' && o.issueTypeLabel.trim().length > 0
        ? o.issueTypeLabel.trim().slice(0, 200)
        : this.defaultIssueTypeLabel(req);
    const urgencyLevel = this.coerceUrgency(o.urgencyLevel);
    const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
    if (!summary) {
      throw new Error('AI-Antwort enthält keine Summary.');
    }
    const bookingDetailsRaw = o.bookingDetails;
    if (!bookingDetailsRaw || typeof bookingDetailsRaw !== 'object') {
      throw new Error('AI-Antwort enthält keine bookingDetails.');
    }
    const bd = bookingDetailsRaw as Record<string, unknown>;
    const bookingDetails: PuzzelTicketBookingDetails = {
      reservationNumber: this.nullableString(bd.reservationNumber),
      roomNumber: this.nullableString(bd.roomNumber),
      checkInDate: this.nullableString(bd.checkInDate),
      checkOutDate: this.nullableString(bd.checkOutDate),
      guestName: this.nullableString(bd.guestName),
      invoiceNumber: this.nullableString(bd.invoiceNumber),
      bookingPlatform: this.nullableString(bd.bookingPlatform),
      otherDetails: Array.isArray(bd.otherDetails)
        ? bd.otherDetails
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter((s): s is string => s.length > 0)
        : [],
    };
    const companyInvoiceBillingDetails = mergeCompanyInvoiceBillingDetails(
      o.companyInvoiceBillingDetails,
    );
    const rationale =
      typeof o.rationale === 'string' && o.rationale.trim().length > 0
        ? o.rationale.trim()
        : '(keine Begründung)';
    const confidence =
      o.confidence === 'high' ||
      o.confidence === 'medium' ||
      o.confidence === 'low'
        ? o.confidence
        : 'medium';
    return {
      prizeCategory,
      requestType: req,
      invoiceAction,
      issueTypeLabel,
      urgencyLevel,
      summary,
      bookingDetails,
      companyInvoiceBillingDetails,
      rationale,
      confidence,
    };
  }

  private defaultIssueTypeLabel(requestType: PuzzelTicketRequestType): string {
    const map: Record<PuzzelTicketRequestType, string> = {
      invoice_correction: 'Invoice / billing correction',
      invoice_resend: 'Invoice resend or copy',
      invoice_other: 'Billing / invoice inquiry',
      unknown: 'Issue type unclear',
    };
    return map[requestType];
  }

  private coerceUrgency(value: unknown): PuzzelTicketUrgency {
    if (value === 'critical' || value === 'high' || value === 'normal' || value === 'low') {
      return value;
    }
    return 'normal';
  }

  private coerceInvoiceAction(
    value: unknown,
    requestType: PuzzelTicketRequestType,
  ): PuzzelInvoiceAction {
    const actions: PuzzelInvoiceAction[] = [
      'resend_only',
      'correct_and_reissue',
      'new_or_additional_invoice',
      'vat_tax_legal',
      'payment_refund',
      'invoice_question',
      'other_billing',
      'unclear',
    ];
    if (typeof value === 'string' && (actions as string[]).includes(value)) {
      return value as PuzzelInvoiceAction;
    }
    return defaultInvoiceActionForRequestType(requestType);
  }

  private coercePrizeCategory(value: unknown): PuzzelTicketPrizeCategory {
    const allowed: PuzzelTicketPrizeCategory[] = [
      'SPAM',
      'RECHNUNG_ANGEFRAGT',
      'RECHNUNGSKORREKTUR',
      'MEHRERE_RECHNUNGSANFRAGEN',
      'SONSTIGES',
    ];
    if (typeof value === 'string' && (allowed as string[]).includes(value)) {
      return value as PuzzelTicketPrizeCategory;
    }
    return 'SONSTIGES';
  }

  private coerceRequestType(value: unknown): PuzzelTicketRequestType {
    if (
      value === 'invoice_correction' ||
      value === 'invoice_resend' ||
      value === 'invoice_other' ||
      value === 'unknown'
    ) {
      return value;
    }
    return 'unknown';
  }

  private nullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
