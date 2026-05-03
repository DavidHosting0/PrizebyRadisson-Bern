import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { PuzzelTicket, PuzzelTicketMessage } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';

/**
 * Possible high-level intents we expect on a Puzzel ticket.
 *
 * Puzzel is used by Prize by Radisson Bern City *exclusively* for invoice/billing
 * issues, so the request type is always one of these three categories — or
 * `unknown` if the model can't tell yet (e.g. only outbound messages so far).
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
  /** Free-form extras the AI thought worth surfacing (e.g. VAT requests). */
  otherDetails: string[];
};

export type PuzzelTicketAiAnalysis = {
  requestType: PuzzelTicketRequestType;
  summary: string;
  bookingDetails: PuzzelTicketBookingDetails;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
};

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

const SYSTEM_PROMPT = `Du bist ein deutschsprachiger Hotel-Buchhaltungs-Assistent für das "Prize by Radisson Bern City". Du bekommst ein Ticket aus dem Puzzel-Ticketsystem, in dem ausschließlich Rechnungs- und Buchhaltungsanliegen landen.

Dein Job:

1. Verstehe das Anliegen aus den Nachrichten des Anfragestellers (z. B. Gast, Travel-Agent, Buchungsplattform).
2. Klassifiziere den Anfragetyp ("requestType") in genau eine der vier Kategorien:
   • "invoice_correction" — der Anfragesteller will eine bestehende Rechnung korrigieren (Adresse, MwSt-Nr., Zahlweise, Stornierung, Betragsfehler, doppelte Buchung, …)
   • "invoice_resend" — eine Rechnung soll (erneut) zugestellt werden (bitte Kopie, Re-Send, „nicht erhalten", PDF anfordern)
   • "invoice_other" — ein anderes Rechnungsthema (z. B. Zahlungsstatus-Klärung, Erstattung-Frage), das nicht 1:1 zu Korrektur oder Versand passt
   • "unknown" — du kannst das Anliegen mit den vorhandenen Informationen nicht eindeutig zuordnen
3. Extrahiere die im Ticket genannten Buchungsdetails. Felder, die nicht vorkommen, lasse als null oder leere Liste.
4. Schreibe einen "summary" — eine **einzige** kurze deutsche Zeile (max. 140 Zeichen), die einer Rezeptionistin sofort zeigt, was zu tun ist. Beispiel: "Rechnung Nr. 12345 soll auf Firma X umgeschrieben werden (Zimmer 217, 12.–15.04.)".
5. Schreibe ein einsätziges "rationale" auf Deutsch, das deine Einordnung begründet (für Audit/Debug).
6. Setze "confidence" auf "high", wenn der Wunsch und die Buchungsdaten klar genannt sind; "medium", wenn das Anliegen klar ist, aber Felder fehlen; "low", wenn unklar.

Wichtig:
- Nutze ausschließlich Informationen aus dem Ticket, erfinde nichts.
- Datumsangaben so übernehmen, wie sie im Ticket stehen (also z. B. "12.04.2026" oder "April 12, 2026"), nicht umrechnen.
- Reservationsnummern und Rechnungsnummern haben oft Buchstaben/Sonderzeichen; übernimm sie wortgleich.
- "otherDetails" ist optional und sollte nur Punkte enthalten, die für die Bearbeitung wichtig sind und nicht in andere Felder passen (z. B. "MwSt-Nummer fehlt", "PDF gewünscht").
- Antworte ausschließlich im vorgegebenen JSON-Schema.`;

const ANALYSIS_JSON_SCHEMA = {
  name: 'PuzzelTicketAnalysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      requestType: {
        type: 'string',
        enum: [
          'invoice_correction',
          'invoice_resend',
          'invoice_other',
          'unknown',
        ],
      },
      summary: { type: 'string' },
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
          'otherDetails',
        ],
      },
      rationale: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: [
      'requestType',
      'summary',
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
    const requestType = this.coerceRequestType(o.requestType);
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
      otherDetails: Array.isArray(bd.otherDetails)
        ? bd.otherDetails
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter((s): s is string => s.length > 0)
        : [],
    };
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
      requestType,
      summary,
      bookingDetails,
      rationale,
      confidence,
    };
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
